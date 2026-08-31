import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  MemoryEntry,
  MemoryUpsertInput,
  MemoryCategory,
  MemoryEvidenceClassification,
  ConversationMessage,
  ConversationContext,
  AdvisoryResponse,
  EvidenceLabel,
  PresentationPayload,
  AgentRequestIntent,
} from './eleva.state';
import { ElevaAdvisoryService } from './eleva.advisory';
import { ElevaResearchService } from './eleva.research';
import { ElevaVoiceService } from './eleva.voice.service';

export type SourceResolver = (path: string) => Promise<string | null>;


@Injectable()
export class ElevaMemoryService {
  private readonly logger = new Logger(ElevaMemoryService.name);
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly conversations = new Map<string, ConversationContext>();
  private sourceResolver: SourceResolver = async () => null;

  constructor(
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly advisoryService?: ElevaAdvisoryService,
    @Optional() private readonly researchService?: ElevaResearchService,
    @Optional() private readonly voiceService?: ElevaVoiceService,
  ) {}

  setSourceResolver(resolver: SourceResolver): void {
    this.sourceResolver = resolver;
  }

  remember(input: MemoryUpsertInput): MemoryEntry {
    const existing = this.findByCategoryAndKey(input.category, input.key);
    const entry: MemoryEntry = {
      id: existing?.id ?? this.generateId(),
      ...input,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    this.entries.set(entry.id, entry);
    this.emitAudit('AGENT.MEMORY.UPSERT', 'ElevaMemory', entry.id, {
      category: entry.category,
      key: entry.key,
      evidenceClassification: entry.provenance.evidenceClassification,
      conversationId: entry.conversationId,
    });

    return { ...entry };
  }

  recall(category?: MemoryCategory, tag?: string): MemoryEntry[] {
    return Array.from(this.entries.values())
      .filter((entry) => {
        if (category && entry.category !== category) {
          return false;
        }
        if (tag && !(entry.tags ?? []).includes(tag)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  findByCategoryAndKey(category: MemoryCategory, key: string): MemoryEntry | undefined {
    return Array.from(this.entries.values()).find((entry) => entry.category === category && entry.key === key);
  }

  startConversation(conversationId: string, initialMemoryKeys: string[] = []): ConversationContext {
    const context: ConversationContext = {
      conversationId,
      messages: [],
      memoryKeys: [...new Set(initialMemoryKeys)],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.set(conversationId, context);
    this.emitAudit('AGENT.CONVERSATION.START', 'ElevaConversation', conversationId, {
      memoryKeys: context.memoryKeys,
    });

    return { ...context, messages: [...context.messages] };
  }

  appendMessage(conversationId: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): ConversationContext | undefined {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return undefined;
    }

    const entry: ConversationMessage = {
      id: this.generateId(),
      createdAt: new Date(),
      ...message,
    };

    context.messages.push(entry);
    context.updatedAt = new Date();

    if (message.role === 'user' && !context.memoryKeys.includes(`conversation:${conversationId}:last-user-message`)) {
      context.memoryKeys.push(`conversation:${conversationId}:last-user-message`);
      this.remember({
        category: MemoryCategory.IMPORTANT_CONVERSATION_CONTEXT,
        key: `conversation:${conversationId}:last-user-message`,
        value: message.content,
        provenance: {
          evidenceClassification: MemoryEvidenceClassification.VERIFIED,
          source: 'conversation',
          retrievedAt: new Date(),
        },
        conversationId,
        tags: ['conversation', conversationId],
      });
    }

    this.emitAudit('AGENT.CONVERSATION.MESSAGE', 'ElevaConversation', conversationId, {
      role: entry.role,
      content: entry.content.slice(0, 200),
      evidenceClassification: entry.evidenceClassification,
    });

    return { ...context, messages: [...context.messages] };
  }

  getConversation(conversationId: string): ConversationContext | undefined {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return undefined;
    }
    return { ...context, messages: [...context.messages] };
  }

  async respondToConversation(
    conversationId: string,
    userMessage: string,
    options: { repositoryFacts?: Record<string, unknown>; forceResearch?: boolean } = {},
  ): Promise<AdvisoryResponse> {
    const context = this.getConversation(conversationId);
    if (!context) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    this.appendMessage(conversationId, { role: 'user', content: userMessage });

    const memorySnapshot = this.recall(undefined, conversationId).slice(0, 20);
    const repositoryFacts = this.buildRepositoryFacts(options.repositoryFacts, memorySnapshot);

    const evidence = await this.buildEvidence(memorySnapshot);

    const advisory = this.advisoryService
      ? await this.advisoryService.advise(userMessage, { repositoryFacts })
      : [
          {
            finding: 'Advisory service unavailable.',
            evidence: [{ label: EvidenceLabel.UNVERIFIED, source: 'runtime-missing-service' }],
            recommendation: 'Do not act on this response until advisory capability is restored.',
            unknowns: ['ElevaAdvisoryService is not wired into this conversation.'],
          },
        ];

    const findings = advisory;
    const labels = this.extractLabels(findings, evidence);
    const intent = this.advisoryService
      ? await this.advisoryService.classifyIntent(userMessage)
      : AgentRequestIntent.QUESTION;

    const presentation = this.advisoryService
      ? this.advisoryService.buildPresentation(findings)
      : ({ problem: 'No analysis available.', decisionRequired: 'Provide analysis before presenting.' } as PresentationPayload);

    const visualExplanation = findings.length
      ? this.advisoryService?.buildVisualExplanation({
          type: 'workflow',
          description: 'ELEVA response workflow for the current request.',
          inputs: ['request', 'repositoryFacts'],
          outputs: ['advisory-response', 'evidence'],
        }) ?? undefined
      : undefined;

    const m2Task = this.advisoryService ? this.advisoryService.buildM2CompatibleTask({ action: intent }) : undefined;

    const response: AdvisoryResponse = {
      message: labels.recommendations[0] || labels.facts[0] || labels.evidence[0] || 'I do not have enough evidence to answer that yet.',
      labels,
      alternatives: findings[0]?.alternatives,
      decisionRequired: findings[0]?.approvalRequired ? 'User approval required before execution.' : 'No approval required for advisory output.',
      presentation,
      visualExplanation,
      m2Task,
    };

    this.appendMessage(conversationId, {
      role: 'eleva',
      content: response.message,
      evidenceClassification: labels.facts.length
        ? MemoryEvidenceClassification.VERIFIED
        : labels.unknowns.length
          ? MemoryEvidenceClassification.UNKNOWN
          : MemoryEvidenceClassification.RECOMMENDATION,
      reasoning: labels.evidence.join('\n') || undefined,
      alternatives: response.alternatives,
    });

    this.remember({
      category: MemoryCategory.IMPORTANT_CONVERSATION_CONTEXT,
      key: `conversation:${conversationId}:last-response`,
      value: response.message,
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.RECOMMENDATION,
        source: 'conversation',
        retrievedAt: new Date(),
      },
      conversationId,
      tags: ['conversation', conversationId],
    });

    return response;
  }

  async speak(response: AdvisoryResponse): Promise<void> {
    if (!response.message) {
      return;
    }

    this.emitAudit('AGENT.VOICE.SPEAK', 'ElevaVoice', 'ElevaVoice', {
      messageLength: response.message.length,
      supported: this.voiceService?.isVoiceSupported() ?? false,
    });

    if (this.voiceService) {
      await this.voiceService.speak(response.message);
    }
  }

  getVoiceState(): { supported: boolean; state: string } {
    if (!this.voiceService) {
      return { supported: false, state: 'IDLE' };
    }
    return {
      supported: this.voiceService.isVoiceSupported(),
      state: this.voiceService.getStateSnapshot().state,
    };
  }

  findByKey(key: string): MemoryEntry | undefined {
    return Array.from(this.entries.values()).find((entry) => entry.key === key);
  }

  private buildRepositoryFacts(
    explicitFacts: Record<string, unknown> | undefined,
    memorySnapshot: MemoryEntry[],
  ): Record<string, unknown> {
    if (explicitFacts) {
      return explicitFacts;
    }
    if (memorySnapshot.length) {
      return Object.fromEntries(memorySnapshot.slice(0, 10).map((entry) => [entry.key, entry.value]));
    }
    return {};
  }

  private async buildEvidence(memorySnapshot: MemoryEntry[]): Promise<Array<{ label: MemoryEvidenceClassification; source: string; detail: string }>> {
    const base: Array<{ label: MemoryEvidenceClassification; source: string; detail: string }> = memorySnapshot.map((entry) => ({
      label: entry.provenance.evidenceClassification,
      source: entry.provenance.source || entry.key,
      detail: entry.value,
    }));

    if (!this.researchService) {
      return base;
    }

    const research = await this.researchService.executeResearch('', []);
    return base.concat(
      research.sources.map((source) => ({
        label: source.evidenceClassification as unknown as MemoryEvidenceClassification,
        source: source.locationOrReference || source.source,
        detail: source.excerptOrSummary,
      })),
    );
  }

  private extractLabels(
    findings: Array<{
      finding?: string;
      evidence?: Array<{ label?: string }>;
      recommendation?: string;
      unknowns?: string[];
    }>,
    evidence: Array<{ label?: MemoryEvidenceClassification; detail?: string }>,
  ): { facts: string[]; evidence: string[]; assumptions: string[]; recommendations: string[]; unknowns: string[] } {
    const labels = {
      facts: new Set<string>(),
      evidence: new Set<string>(),
      assumptions: new Set<string>(),
      recommendations: new Set<string>(),
      unknowns: new Set<string>(),
    };

    for (const finding of findings) {
      if (finding.finding) {
        labels.facts.add(finding.finding);
      }
      if (finding.recommendation) {
        labels.recommendations.add(finding.recommendation);
      }
      for (const unknown of finding.unknowns ?? []) {
        labels.unknowns.add(unknown);
      }
    }

    for (const item of evidence) {
      const detail = item.detail || '';
      if (!detail) {
        continue;
      }
      const normalized = (item.label ?? MemoryEvidenceClassification.UNKNOWN);
      if (normalized === MemoryEvidenceClassification.VERIFIED) {
        labels.facts.add(detail);
        labels.evidence.add(detail);
      } else if (normalized === MemoryEvidenceClassification.EVIDENCE) {
        labels.evidence.add(detail);
      } else if (normalized === MemoryEvidenceClassification.ASSUMPTION) {
        labels.assumptions.add(detail);
      } else if (normalized === MemoryEvidenceClassification.RECOMMENDATION) {
        labels.recommendations.add(detail);
      } else if (normalized === MemoryEvidenceClassification.UNKNOWN) {
        labels.unknowns.add(detail);
      } else {
        labels.evidence.add(detail);
      }
    }

    return {
      facts: Array.from(labels.facts).slice(0, 20),
      evidence: Array.from(labels.evidence).slice(0, 20),
      assumptions: Array.from(labels.assumptions).slice(0, 20),
      recommendations: Array.from(labels.recommendations).slice(0, 20),
      unknowns: Array.from(labels.unknowns).slice(0, 20),
    };
  }

  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private emitAudit(action: string, entityName: string, entityId: string, values: Record<string, unknown>): void {
    if (!this.auditService?.log) {
      return;
    }

    this.auditService
      .log({
        tenantId: null,
        userId: null,
        action,
        entityName,
        entityId,
        oldValues: null,
        newValues: values,
        ipAddress: 'system',
        userAgent: 'eleva-memory',
      })
      .catch((error: unknown) =>
        this.logger.error(`Failed to emit ELEVA memory audit log: ${error instanceof Error ? error.message : 'unknown'}`),
      );
  }
}
