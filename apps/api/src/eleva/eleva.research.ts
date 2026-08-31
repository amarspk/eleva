import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  ProjectContext,
  ContextRelevance,
  ResearchPlan,
  ResearchSource,
  ResearchResult,
  M4AdvisoryInput,
  EvidenceLabel,
} from './eleva.state';
import { ElevaExternalResearchProviderService, ExternalResearchProvider } from './eleva.research.provider';

export type SourceResolver = (path: string) => Promise<string | null>;

@Injectable()
export class ElevaResearchService {
  private readonly logger = new Logger(ElevaResearchService.name);
  private sourceResolver: SourceResolver = async () => null;

  constructor(
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly externalResearchProvider?: ElevaExternalResearchProviderService,
  ) {}

  setSourceResolver(resolver: SourceResolver): void {
    this.sourceResolver = resolver;
  }

  setExternalResearchProvider(provider: ExternalResearchProvider): void {
    this.externalResearchProvider?.setProvider(provider);
  }

  async retrieveProjectContext(request: string): Promise<ProjectContext[]> {
    const contexts: ProjectContext[] = [];

    try {
      const content = await this.sourceResolver(request);
      if (typeof content === 'string' && content.trim().length > 0) {
        contexts.push({
          location: 'repository-context',
          kind: 'document',
          retrievedAt: new Date(),
          content: content,
          metadata: { provider: 'repository-context' },
        });
      }
    } catch (error) {
      this.logger.warn(`Project context retrieval failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return contexts;
  }

  async rankContext(request: string, contexts: ProjectContext[]): Promise<ContextRelevance[]> {
    const terms = this.tokenize(request);

    return contexts
      .map((context) => {
        const haystack = `${context.location} ${context.content}`.toLowerCase();
        const matchedTerms = terms.filter((term) => haystack.includes(term));
        const score = matchedTerms.length / Math.max(terms.length, 1);

        return {
          location: context.location,
          score: Math.min(score, 1),
          reason: matchedTerms.length ? `Matched ${matchedTerms.length}/${terms.length} request terms` : 'No direct term match',
          content: context.content,
          retrievedAt: context.retrievedAt,
        } as ContextRelevance;
      })
      .sort((a, b) => b.score - a.score || a.location.localeCompare(b.location));
  }

  planResearch(request: string): ResearchPlan {
    const researchQuestions = this.extractResearchQuestions(request);

    const plan: ResearchPlan = {
      question: request,
      researchQuestions,
      requiredEvidence: [
        'Repository-verified source or file path.',
        'Evidence classification for each retrieved fact.',
        'Explicit unknowns when information cannot be confirmed.',
      ],
      needsExternalResearch: false,
    };

    if (!researchQuestions.length) {
      plan.requiredEvidence = ['Use available repository context; do not fabricate missing facts.'];
      plan.caveat = 'No explicit research questions were extracted from the request.';
    }

    this.emitAudit('AGENT.RESEARCH.PLAN', 'ElevaResearch', undefined, plan as unknown as Record<string, unknown>);
    return plan;
  }

  async executeResearch(request: string, contexts: ProjectContext[]): Promise<ResearchResult> {
    const plan = this.planResearch(request);
    const relevantContexts = contexts.length ? contexts : await this.retrieveProjectContext(request);
    const ranked = await this.rankContext(request, relevantContexts);
    const highConfidence = ranked.filter((item) => item.score >= 0.25);

    const sources: ResearchSource[] = highConfidence.map((item) => ({
      source: item.location,
      title: item.location,
      locationOrReference: item.location,
      retrieved: item.retrievedAt,
      excerptOrSummary: item.content.slice(0, 4000),
      evidenceClassification: EvidenceLabel.VERIFIED,
      confidence: item.score >= 0.6 ? 'high' : item.score >= 0.35 ? 'medium' : 'low',
      limitations: item.score < 0.6 ? ['Low term overlap with request; treat as supporting context only.'] : undefined,
    }));

    const verifiedFacts = this.extractVerifiedFacts(highConfidence);
    const inferences = this.extractInferences(verifiedFacts);
    const assumptions = this.extractAssumptions(request);
    const unknowns = this.extractUnknowns(highConfidence, request);
    const findings = [...verifiedFacts, ...inferences, ...assumptions, ...unknowns].filter(Boolean);
    const conflicts = this.detectConflicts(highConfidence, sources);

    const result: ResearchResult = {
      researchQuestion: request,
      sources,
      findings,
      verifiedFacts,
      inferences,
      assumptions,
      unknowns,
      limitations: [
        ...new Set([
          ...(plan.caveat ? [plan.caveat] : []),
          ...highConfidence.length ? [] : ['No repository context was retrieved for this request.'],
          ...(sources.some((source) => source.limitations?.length) ? ['Some retrieved context has limited relevance to the request.'] : []),
          ...(conflicts.length ? ['Conflicting evidence was preserved and not silently resolved.'] : []),
        ]),
      ],
      conflicts: conflicts.length ? conflicts : undefined,
      retrievedAt: new Date(),
      stale: false,
    };

    this.emitAudit('AGENT.RESEARCH.EXECUTE', 'ElevaResearch', undefined, { researchQuestion: request, sourceCount: sources.length, stale: result.stale });
    return result;
  }

  buildM4AdvisoryInput(results: ResearchResult[]): M4AdvisoryInput {
    const evidence = results
      .flatMap((result) =>
        result.sources.map((source) => ({
          label: source.evidenceClassification,
          source: source.locationOrReference || source.source,
          detail: source.excerptOrSummary,
        })),
      )
      .filter((item, index, array) => array.findIndex((existing) => existing.source === item.source && existing.detail === item.detail) === index);

    const confidence = this.summarizeConfidence(results);
    const affectedByConflict = results.some((result) => (result.conflicts?.length ?? 0) > 0);

    return {
      research: results,
      evidence,
      conclusionConfidence: confidence,
      affectedByConflict,
    };
  }

  private async resolveExternalContext(_request: string): Promise<ProjectContext[]> {
    return [];
  }

  private tokenize(text: string): string[] {
    return text
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 2)
      .slice(0, 64);
  }

  private extractResearchQuestions(request: string): string[] {
    const questions: string[] = [];
    const sentences = request
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.trim().length > 3);

    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      if (/^(what|why|how|when|where|who|is|are|does|do|can|could|should)/i.test(cleaned) || /\?/.test(cleaned)) {
        questions.push(cleaned);
      }
    }

    if (!questions.length) {
      questions.push(request.trim());
    }
    return questions.slice(0, 8);
  }

  private extractVerifiedFacts(contexts: ContextRelevance[]): string[] {
    const facts: string[] = [];
    for (const context of contexts) {
      const lines = context.content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('>') || trimmed.startsWith('#') || trimmed.startsWith('- ')) {
          continue;
        }
        if (context.score >= 0.8 && facts.length < 16) {
          facts.push(trimmed);
        }
      }
    }
    return facts;
  }

  private extractInferences(verifiedFacts: string[]): string[] {
    const inferences: string[] = [];
    const primarySource = verifiedFacts[0];
    if (!primarySource) {
      return inferences;
    }
    if (/\b(fixed|verified|complete|implemented|replaced|closed)\b/i.test(primarySource)) {
      inferences.push(`Primary retrieved context indicates a resolved state: ${primarySource.slice(0, 220)}`);
    }
    if (/\b(UNKNOWN|CANNOT CONFIRM|UNVERIFIED)\b/.test(primarySource)) {
      inferences.push('Primary retrieved context contains unresolved or explicitly unverifiable claims.');
    }
    return inferences;
  }

  private extractAssumptions(request: string): string[] {
    const assumptions: string[] = [];
    if (/\b(current|latest|active|production)\b/i.test(request)) {
      assumptions.push('Assessment assumes the retrieved repository context reflects the current requested state.');
    }
    return assumptions;
  }

  private extractUnknowns(contexts: ContextRelevance[], _request: string): string[] {
    const unknowns: string[] = [];
    if (!contexts.length) {
      unknowns.push('No matching repository context was found for this request. ELEVA cannot confirm the requested information.');
      return unknowns;
    }
    if (contexts.every((item) => item.score < 0.25)) {
      unknowns.push('Retrieved context has weak relevance to the request. Conclusions should be treated as unverified.');
    }
    return unknowns;
  }

  private detectConflicts(contexts: ContextRelevance[], sources: ResearchSource[]): Array<{ first: ResearchSource; second: ResearchSource; explanation: string }> {
    const conflicts: Array<{ first: ResearchSource; second: ResearchSource; explanation: string }> = [];
    const byLocation = new Map<string, ResearchSource[]>();
    for (const source of sources) {
      const key = source.locationOrReference || source.source;
      const existing = byLocation.get(key);
      if (existing) {
        existing.push(source);
      } else {
        byLocation.set(key, [source]);
      }
    }

    for (const context of contexts) {
      const sourceBucket = byLocation.get(context.location);
      if (!sourceBucket || sourceBucket.length < 2) {
        continue;
      }
      const first = sourceBucket[0];
      const second = sourceBucket[1];
      if (
        first.evidenceClassification !== second.evidenceClassification ||
        first.confidence !== second.confidence ||
        first.excerptOrSummary !== second.excerptOrSummary
      ) {
        conflicts.push({
          first,
          second,
          explanation: `Conflicting evidence was retrieved from ${first.locationOrReference || first.source}. Preserve both sources and resolve via additional evidence before acting.`,
        });
      }
    }

    return conflicts;
  }

  private summarizeConfidence(results: ResearchResult[]): M4AdvisoryInput['conclusionConfidence'] {
    const hasVerified = results.some((result) => result.verifiedFacts.length > 0);
    const hasConflict = results.some((result) => (result.conflicts?.length ?? 0) > 0);
    const hasUnknowns = results.some((result) => result.unknowns.length > 0);

    if (!hasVerified || hasConflict) {
      return 'low';
    }
    if (hasUnknowns) {
      return 'medium';
    }
    return 'high';
  }

  private emitAudit(action: string, entityName: string, entityId: string | undefined, values: Record<string, unknown>): void {
    if (!this.auditService?.log) {
      return;
    }

    this.auditService
      .log({
        tenantId: null,
        userId: null,
        action,
        entityName,
        entityId: entityId ?? null,
        oldValues: null,
        newValues: values,
        ipAddress: 'system',
        userAgent: 'eleva-research',
      })
      .catch((error: unknown) => this.logger.error(`Failed to emit ELEVA research audit log: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}
