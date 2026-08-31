import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  AgentRequestIntent,
  EvidenceLabel,
  AnalysisFinding,
  RiskEntry,
  ImplementationPlan,
  OptionComparison,
  DecisionRecord,
  ExplanationOutput,
  PresentationPayload,
  VisualExplanationContract,
  VoiceInteractionBoundary,
} from './eleva.state';

export type SourceResolver = (path: string) => Promise<string | null>;

@Injectable()
export class ElevaAdvisoryService {
  private readonly logger = new Logger(ElevaAdvisoryService.name);
  private readonly decisions = new Map<string, DecisionRecord>();
  private sourceResolver: SourceResolver = async () => null;
  private readonly auditService?: AuditService;

  constructor(
    @Optional() auditService?: AuditService,
  ) {
    this.auditService = auditService;
  }

  setSourceResolver(resolver: SourceResolver): void {
    this.sourceResolver = resolver;
  }

  async classifyIntent(request: string): Promise<AgentRequestIntent> {
    const normalized = request.trim().toLowerCase();
    if (this.isExecutionPhrase(normalized)) {
      return AgentRequestIntent.EXECUTION;
    }

    if (/\b(?:diagnostic|failure|error|broken|failing|issue|problem|incident|degrad)\b/.test(normalized)) {
      return AgentRequestIntent.DIAGNOSTIC;
    }
    if (/\b(?:recommend|suggest|advise|best|prefer|alternative|instead|should we)\b/.test(normalized)) {
      return AgentRequestIntent.RECOMMENDATION;
    }
    if (/\b(?:analyze|analyse|diagnose|debug|inspect|review|audit|compare|trade-off|plan)\b/.test(normalized)) {
      return AgentRequestIntent.ANALYSIS;
    }
    if (/\b(?:how|what|why|when|where|who|is|are|can|could|does|do|explain|tell me)\b/.test(normalized)) {
      return AgentRequestIntent.QUESTION;
    }

    return AgentRequestIntent.QUESTION;
  }

  async advise(request: string, context?: { repositoryFacts?: Record<string, unknown> }): Promise<AnalysisFinding[]> {
    const intent = await this.classifyIntent(request);
    const findings: AnalysisFinding[] = [];

    if (intent === AgentRequestIntent.EXECUTION) {
      findings.push({
        finding: 'Execution request detected. The M3 advisory layer does not perform changes.',
        evidence: [
          {
            label: EvidenceLabel.VERIFIED,
            source: 'ELEVA_AGENT_SPEC.md',
            detail: '§6.9 Human Decision / Approval; §6.15 M2 Integration',
          },
        ],
        recommendation: 'Route this request through the existing M2 approval/execution pipeline.',
        unknowns: ['Exact M2 tool mapping is outside M3 advisory scope.'],
      });
      return findings;
    }

    const repoFacts = context?.repositoryFacts;
    if (repoFacts && Object.keys(repoFacts).length > 0) {
      findings.push({
        finding: 'Repository context was supplied for grounding.',
        evidence: [
          {
            label: EvidenceLabel.VERIFIED,
            source: 'provided repositoryFacts',
            detail: JSON.stringify(repoFacts).slice(0, 200),
          },
        ],
        benefits: ['Reduces unknowns.', 'Improves recommendation quality.'],
        unknowns: ['Live runtime state may differ from static repository facts.'],
      });
    } else {
      findings.push({
        finding: 'No repository facts were supplied for grounding.',
        evidence: [{ label: EvidenceLabel.UNVERIFIED, source: 'runtime context missing' }],
        recommendation: 'Supply repository-verified facts or document this limitation before acting.',
        unknowns: ['Static inspection cannot confirm runtime behavior.'],
      });
    }

    return findings;
  }

  async analyze(request: string, context?: { repositoryFacts?: Record<string, unknown> }): Promise<AnalysisFinding[]> {
    const findings = await this.advise(request, context);
    if (findings.length === 0) {
      findings.push({
        finding: 'None observed.',
        evidence: [{ label: EvidenceLabel.UNVERIFIED, source: 'empty analysis context' }],
      });
    }
    return findings;
  }

  compareOptions(options: OptionComparison): OptionComparison {
    if (!options.options || options.options.length < 2) {
      throw new Error('Option comparison requires at least two options.');
    }
    return {
      ...options,
      recommendedOption: options.recommendedOption ?? options.options[0].name,
    };
  }

  assessRisks(risks: RiskEntry[]): RiskEntry[] {
    const seen = new Set<string>();
    return risks.filter((risk) => {
      const key = `${risk.classification}:${risk.area}:${risk.triggerOrEvidence}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  createPlan(plan: ImplementationPlan): ImplementationPlan {
    if (!plan.objective.trim()) {
      throw new Error('Plan objective is required.');
    }
    if (!plan.phases.length) {
      throw new Error('Plan requires at least one phase.');
    }
    return { ...plan };
  }

  buildExplanation(output: ExplanationOutput): ExplanationOutput {
    if (!output.approvalRequired) {
      output.approvalRequired = this.hasExecutionElements(output);
    }
    return output;
  }

  recordDecision(record: Omit<DecisionRecord, 'id' | 'timestamp'>): DecisionRecord {
    const id = `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const decision: DecisionRecord = {
      id,
      timestamp: new Date(),
      ...record,
    };
    this.decisions.set(id, decision);
    const payload: Record<string, unknown> = {
      id: decision.id,
      summary: decision.summary,
      rationale: decision.rationale,
      approvalStatus: decision.approvalStatus,
      initiatedBy: decision.initiatedBy,
      timestamp: decision.timestamp,
    };
    this.emitAudit('AGENT.RECORD_DECISION', 'ElevaDecision', id, payload);
    return decision;
  }

  getDecision(id: string): DecisionRecord | undefined {
    return this.decisions.get(id);
  }

  buildPresentation(analysis: AnalysisFinding[]): PresentationPayload {
    if (!analysis.length) {
      return {
        problem: 'No analysis available.',
        decisionRequired: 'Provide analysis before presenting.',
      };
    }

    const first = analysis[0];
    const risks = (first.risks ?? []).map(
      (risk) => `${risk.classification} - ${risk.area}: ${risk.triggerOrEvidence}`,
    );
    const options = first.alternatives?.length
      ? {
          options: first.alternatives.map((alternative) => ({
            name: alternative,
            benefits: [],
            costsEffort: 'CANNOT ESTIMATE',
            risks,
            operationalImpact: 'None observed',
          })),
        }
      : {
          options: [
            {
              name: 'Current',
              benefits: [],
              costsEffort: 'CANNOT ESTIMATE',
              risks,
              operationalImpact: 'None observed',
            },
          ],
        };

    return {
      problem: first.finding,
      currentState: first.evidence.map((e) => e.source).join('; ') || undefined,
      options,
      benefits: first.benefits,
      costs: first.costsEffort ? [first.costsEffort] : undefined,
      risks,
      technicalImpact: first.technicalImpact,
      recommendation: first.recommendation,
      implementationPlan: first.recommendation
        ? {
            objective: first.recommendation,
            affectedComponents: [],
            phases: [],
            dependencies: [],
            verificationRequirements: [],
            rollbackOrAbortCriteria: [],
          }
        : undefined,
      decisionRequired: first.approvalRequired ? 'User approval required before execution.' : 'No approval required for advisory output.',
    };
  }

  buildVisualExplanation(
    contract: Omit<VisualExplanationContract, 'type'> & { type?: VisualExplanationContract['type'] },
  ): VisualExplanationContract {
    return {
      type: contract.type ?? 'workflow',
      description: contract.description ?? '',
      inputs: contract.inputs ?? [],
      outputs: contract.outputs ?? [],
    };
  }

  voiceBoundary(): VoiceInteractionBoundary {
    return {
      supported: false,
      description: 'No repository voice infrastructure is currently wired into the ELEVA module. M3 defines the boundary contract only.',
      inputContract: { text: { type: 'string' } },
      outputContract: { advisoryText: { type: 'string' } },
    };
  }

  buildM2CompatibleTask(input: Record<string, unknown>): Record<string, unknown> {
    return {
      action: input.action ?? 'advisory.review',
      toolName: 'agent.safe_demo_tool',
      capability: 'PROJECT_MANAGEMENT',
      requiredPermission: { action: 'read', resource: 'agent' },
      risk: 'LOW',
      input,
    };
  }

  private isExecutionPhrase(normalized: string): boolean {
    const executionMarkers = ['please do', 'go ahead', 'execute', 'apply the', 'make it so'];
    return executionMarkers.some((marker) => normalized.includes(marker));
  }

  private hasExecutionElements(output: ExplanationOutput): boolean {
    return Boolean(
      output.proposedImplementation ||
        (output.risks || []).some((risk) => risk.classification === 'HIGH' || risk.classification === 'CRITICAL'),
    );
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
        userAgent: 'eleva-advisory',
      })
      .catch((error: unknown) => this.logger.error(`Failed to emit ELEVA advisory audit log: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}
