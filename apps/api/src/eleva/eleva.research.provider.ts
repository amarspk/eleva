import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

/**
 * Clean provider boundary for external research providers.
 *
 * If a real external research/web provider is available in the repository,
 * it should implement this interface and be wired into the ELEVA module.
 * M5 does not require a fake provider when none is available.
 */
export interface ExternalResearchProvider {
  readonly supported: boolean;
  readonly description: string;

  research(query: string): Promise<ExternalResearchResult>;
}

export interface ExternalResearchResult {
  sources: ExternalResearchSource[];
  findings: string[];
  verifiedFacts: string[];
  inferences: string[];
  assumptions: string[];
  unknowns: string[];
  limitations: string[];
  retrievedAt: Date;
}

export interface ExternalResearchSource {
  source: string;
  locationOrReference?: string;
  excerptOrSummary: string;
  evidenceClassification: 'verified' | 'inferred' | 'assumption' | 'unverified';
  confidence: 'high' | 'medium' | 'low';
  limitations?: string[];
}

export const DEFAULT_EXTERNAL_RESEARCH_PROVIDER: ExternalResearchProvider = {
  supported: false,
  description: 'No external research provider is wired into ELEVA. Connect a real provider via this boundary; do not fabricate research results.',

  async research(_query: string) {
    return {
      sources: [],
      findings: [],
      verifiedFacts: [],
      inferences: [],
      assumptions: [],
      unknowns: ['External research is unavailable in the current environment.'],
      limitations: [
        'No external research provider is configured.',
        'ELEVA must not fabricate sources, URLs, or research results when this boundary is unavailable.',
      ],
      retrievedAt: new Date(),
    };
  },
};

@Injectable()
export class ElevaExternalResearchProviderService {
  private readonly logger = new Logger(ElevaExternalResearchProviderService.name);
  private provider: ExternalResearchProvider = DEFAULT_EXTERNAL_RESEARCH_PROVIDER;

  constructor(@Optional() private readonly auditService?: AuditService) {}

  setProvider(provider: ExternalResearchProvider): void {
    this.provider = provider;
    this.logger.log(`External research provider set. supported=${provider.supported}`);
  }

  getBoundary(): { supported: boolean; description: string } {
    return {
      supported: this.provider.supported,
      description: this.provider.description,
    };
  }

  async research(query: string): Promise<ExternalResearchResult> {
    const start = Date.now();
    const result = await this.provider.research(query);
    this.emitAudit('AGENT.RESEARCH.PROVIDER', 'ElevaExternalResearch', undefined, {
      query,
      supported: this.provider.supported,
      sourceCount: result.sources.length,
      latencyMs: Date.now() - start,
    });
    return result;
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
        userAgent: 'eleva-research-provider',
      })
      .catch((error: unknown) =>
        this.logger.error(`Failed to emit ELEVA research provider audit log: ${error instanceof Error ? error.message : 'unknown'}`),
      );
  }
}
