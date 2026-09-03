import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  Signal,
  SignalStatus,
  Event,
  EventCategoryM7,
  Situation,
  SituationState,
  Severity,
  RecommendationM7,
  AlertM7,
  Correlation,
  AnomalyRule,
  CreateSignalRequest,
  ScheduledCheckResult,
  SituationMemoryRecord,
  M7IntelligenceContext,
  RiskEntry,
} from './eleva.state';

export type ProviderAvailability = {
  available: boolean;
  reason?: string;
};

@Injectable()
export class ElevaIntelligenceService {
  private readonly logger = new Logger(ElevaIntelligenceService.name);
  private readonly signals = new Map<string, Signal>();
  private readonly events = new Map<string, Event>();
  private readonly situations = new Map<string, Situation>();
  private readonly recommendations = new Map<string, RecommendationM7>();
  private readonly alerts = new Map<string, AlertM7>();
  private readonly anomalyRules = new Map<string, AnomalyRule>();
  private readonly situationMemory = new Map<string, SituationMemoryRecord[]>();
  private readonly availableProviders = new Map<string, ProviderAvailability>();

  constructor(@Optional() private readonly auditService?: AuditService) {
    this.registerDefaultAnomalyRules();
  }

  async ingestSignal(request: CreateSignalRequest): Promise<Signal> {
    const id = this.generateId('signal');
    const signal: Signal = {
      id,
      source: request.source,
      type: request.type,
      receivedAt: new Date(),
      status: SignalStatus.RECEIVED,
      raw: { ...request.raw },
      evidence: request.evidence ? { ...request.evidence } : undefined,
    };

    this.signals.set(id, signal);
    this.emitAudit('AGENT.M7.SIGNAL_RECEIVED', 'ElevaSignal', id, {
      source: signal.source,
      type: signal.type,
      status: signal.status,
    });

    return { ...signal };
  }

  convertSignalToEvent(signalId: string, category: EventCategoryM7, correlationKey?: string): Event {
    const signal = this.requireSignal(signalId);
    if (signal.status === SignalStatus.INVALID || signal.status === SignalStatus.REJECTED) {
      throw new Error(`Signal [${signalId}] is not valid and cannot be converted to an event.`);
    }

    const validStatuses: SignalStatus[] = [SignalStatus.RECEIVED, SignalStatus.VALID];
    if (!validStatuses.includes(signal.status)) {
      signal.status = SignalStatus.VALID;
    }

    const id = this.generateId('event');
    const event: Event = {
      id,
      signalId,
      source: signal.source,
      category,
      type: signal.type,
      receivedAt: new Date(),
      data: { ...signal.raw },
      correlationKey,
    };

    this.events.set(id, event);
    this.emitAudit('AGENT.M7.EVENT_CREATED', 'ElevaEvent', id, {
      signalId,
      category,
      type: event.type,
      correlationKey,
    });

    return { ...event, data: { ...event.data } };
  }

  correlateEvents(eventIds: string[], correlation: Correlation): string[] {
    if (eventIds.length < 1) {
      throw new Error('Event correlation requires at least one event.');
    }

    const normalizedReason = correlation.reason?.trim();
    if (!normalizedReason) {
      throw new Error('correlationReason is required for event correlation.');
    }

    const situationId = this.deriveSituationIdFromCorrelation(eventIds, correlation);
    const existing = this.situations.get(situationId);
    const now = new Date();

    const relatedEventIds = Array.from(new Set([...(existing?.eventIds ?? []), ...eventIds]));
    const situation: Situation = {
      id: situationId,
      state: existing?.state ?? SituationState.DETECTED,
      severity: existing?.severity ?? Severity.LOW,
      eventIds: relatedEventIds,
      correlationReason: normalizedReason,
      detectedAt: existing?.detectedAt ?? now,
      lastUpdatedAt: now,
      knownImpact: existing?.knownImpact,
      analysis: existing?.analysis,
      recommendations: existing?.recommendations ?? [],
      alerts: existing?.alerts ?? [],
      evidence: existing?.evidence ?? [],
      resolution: existing?.resolution,
    };

    this.situations.set(situationId, situation);
    this.emitAudit('AGENT.M7.EVENTS_CORRELATED', 'ElevaSituation', situationId, {
      eventIds: relatedEventIds,
      reason: normalizedReason,
      criteria: correlation.criteria,
    });

    return [situationId];
  }

  detectAnomalies(eventIds: string[]): { ruleId: string; reason?: string; evidence?: Record<string, unknown> }[] {
    const events = eventIds.map((eventId) => this.requireEvent(eventId));
    const triggered: { ruleId: string; reason?: string; evidence?: Record<string, unknown> }[] = [];

    for (const rule of this.anomalyRules.values()) {
      const result = rule.evaluate(events);
      if (result?.triggered) {
        triggered.push({
          ruleId: rule.id,
          reason: result.reason,
          evidence: result.evidence,
        });
      }
    }

    return triggered;
  }

  assessSituationSeverity(situationId: string, severity: Severity, reason: string, evidence: Record<string, unknown>): Situation {
    const situation = this.requireSituation(situationId);
    if (severity === Severity.HIGH || severity === Severity.CRITICAL) {
      if (!reason?.trim() || Object.keys(evidence).length === 0) {
        throw new Error('HIGH/CRITICAL severity assessments must include a reason and supporting evidence.');
      }
    }

    situation.severity = severity;
    situation.lastUpdatedAt = new Date();
    this.situations.set(situationId, situation);

    this.emitAudit('AGENT.M7.SEVERITY_ASSESSED', 'ElevaSituation', situationId, {
      severity,
      reason,
      evidenceKeys: Object.keys(evidence),
    });

    return this.cloneSituation(situation);
  }

  createRecommendation(situationId: string, input: { summary: string; proposedAction: string; reason: string; risk: RiskEntry; approvalRequired: boolean }): RecommendationM7 {
    const situation = this.requireSituation(situationId);
    const id = this.generateId('recommendation');
    const recommendation: RecommendationM7 = {
      id,
      situationId,
      summary: input.summary,
      proposedAction: input.proposedAction,
      reason: input.reason,
      risk: input.risk,
      approvalRequired: input.approvalRequired,
      status: 'PENDING',
      createdAt: new Date(),
    };

    this.recommendations.set(id, recommendation);
    situation.recommendations = [...situation.recommendations, recommendation];
    situation.lastUpdatedAt = new Date();
    this.situations.set(situationId, situation);

    this.emitAudit('AGENT.M7.RECOMMENDATION_CREATED', 'ElevaRecommendation', id, {
      situationId,
      approvalRequired: input.approvalRequired,
    });

    return { ...recommendation, risk: { ...input.risk } };
  }

  alertForSituation(situationId: string, reason: string, evidence: Record<string, unknown>): AlertM7 {
    const situation = this.requireSituation(situationId);
    const id = this.generateId('alert');
    const alert: AlertM7 = {
      id,
      situationId,
      severity: situation.severity,
      reason,
      evidence: { ...evidence },
    };

    this.alerts.set(id, alert);
    situation.alerts = [...situation.alerts, alert];
    situation.lastUpdatedAt = new Date();
    this.situations.set(situationId, situation);

    this.emitAudit('AGENT.M7.ALERT_CREATED', 'ElevaAlert', id, {
      situationId,
      severity: situation.severity,
      reason,
    });

    return { ...alert, evidence: { ...alert.evidence } };
  }

  advanceSituationState(situationId: string, state: SituationState): Situation {
    const situation = this.requireSituation(situationId);
    situation.state = state;
    situation.lastUpdatedAt = new Date();
    if (state === SituationState.RESOLVED) {
      situation.resolution = 'Situation marked resolved by operator.';
    }
    this.situations.set(situationId, situation);

    this.emitAudit('AGENT.M7.SITUATION_STATE_ADVANCED', 'ElevaSituation', situationId, {
      state,
    });

    return this.cloneSituation(situation);
  }

  registerAnomalyRule(rule: AnomalyRule): void {
    this.anomalyRules.set(rule.id, rule);
    this.emitAudit('AGENT.M7.ANOMALY_RULE_REGISTERED', 'ElevaAnomalyRule', rule.id, {
      name: rule.name,
    });
  }

  getSignal(id: string): Signal | undefined {
    const signal = this.signals.get(id);
    return signal ? { ...signal, raw: { ...signal.raw }, evidence: signal.evidence ? { ...signal.evidence } : undefined } : undefined;
  }

  getEvent(id: string): Event | undefined {
    const event = this.events.get(id);
    return event ? { ...event, data: { ...event.data } } : undefined;
  }

  getSituation(id: string): Situation | undefined {
    const situation = this.situations.get(id);
    return situation ? this.cloneSituation(situation) : undefined;
  }

  listSituations(): Situation[] {
    return Array.from(this.situations.values()).map((situation) => this.cloneSituation(situation));
  }

  getIntelligenceContext(): M7IntelligenceContext {
    return {
      signals: Array.from(this.signals.values()).map((signal) => ({ ...signal, raw: { ...signal.raw }, evidence: signal.evidence ? { ...signal.evidence } : undefined })),
      events: Array.from(this.events.values()).map((event) => ({ ...event, data: { ...event.data } })),
      situations: this.listSituations(),
      anomalies: [],
    };
  }

  async executeScheduledCheck(provider: string): Promise<ScheduledCheckResult> {
    const availability = this.availableProviders.get(provider) ?? { available: false, reason: 'Provider has not been configured for scheduled checks.' };
    const checkedAt = new Date();

    if (!availability.available) {
      const result: ScheduledCheckResult = {
        id: this.generateId('scheduled-check'),
        provider,
        checkedAt,
        available: false,
        error: availability.reason ?? 'Provider is unavailable.',
      };

      this.emitAudit('AGENT.M7.SCHEDULED_CHECK_UNAVAILABLE', 'ElevaScheduledCheck', result.id, {
        provider,
        reason: result.error,
      });

      return result;
    }

    const result: ScheduledCheckResult = {
      id: this.generateId('scheduled-check'),
      provider,
      checkedAt,
      available: true,
      result: { status: 'checked', note: 'Real provider checks must be wired by the operator.' },
    };

    this.emitAudit('AGENT.M7.SCHEDULED_CHECK_EXECUTED', 'ElevaScheduledCheck', result.id, {
      provider,
    });

    return result;
  }

  setProviderAvailability(provider: string, available: boolean, reason?: string): void {
    this.availableProviders.set(provider, { available, reason });
  }

  rememberSituationMemory(record: SituationMemoryRecord): void {
    const existing = this.situationMemory.get(record.situationId) ?? [];
    const updated = existing.map((item) => (item.memoryKey === record.memoryKey ? { ...record, updatedAt: new Date() } : item));
    if (!updated.some((item) => item.memoryKey === record.memoryKey)) {
      updated.push({ ...record, updatedAt: new Date() });
    }
    this.situationMemory.set(record.situationId, updated);

    this.emitAudit('AGENT.M7.SITUATION_MEMORY', 'ElevaSituationMemory', record.situationId, {
      memoryKey: record.memoryKey,
      evidenceClassification: record.provenance.evidenceClassification,
    });
  }

  recallSituationMemory(situationId: string): SituationMemoryRecord[] {
    return (this.situationMemory.get(situationId) ?? []).map((item) => ({ ...item, provenance: { ...item.provenance } }));
  }

  private deriveSituationIdFromCorrelation(eventIds: string[], correlation: Correlation): string {
    const criteriaKey = JSON.stringify(correlation.criteria);
    const eventKey = eventIds.sort().join('|');
    let hash = 0;
    for (let index = 0; index < eventKey.length; index += 1) {
      hash = ((hash << 5) - hash + eventKey.charCodeAt(index)) | 0;
    }
    for (let index = 0; index < criteriaKey.length; index += 1) {
      hash = ((hash << 5) - hash + criteriaKey.charCodeAt(index)) | 0;
    }
    const prefix = Math.abs(hash).toString(36);
    return `situation:${prefix}:${Date.now().toString(36)}`;
  }

  private requireSignal(signalId: string): Signal {
    const signal = this.signals.get(signalId);
    if (!signal) {
      throw new Error(`Signal [${signalId}] was not found.`);
    }
    return signal;
  }

  private requireEvent(eventId: string): Event {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event [${eventId}] was not found.`);
    }
    return event;
  }

  private requireSituation(situationId: string): Situation {
    const situation = this.situations.get(situationId);
    if (!situation) {
      throw new Error(`Situation [${situationId}] was not found.`);
    }
    return situation;
  }

  private cloneSituation(situation: Situation): Situation {
    return {
      ...situation,
      evidence: situation.evidence.map((item) => ({ ...item })),
      recommendations: situation.recommendations.map((item) => ({ ...item, risk: { ...item.risk } })),
      alerts: situation.alerts.map((item) => ({ ...item, evidence: { ...item.evidence } })),
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private registerDefaultAnomalyRules(): void {
    this.registerAnomalyRule({
      id: 'repeated-failures-window',
      name: 'Repeated failures within a configured window',
      description: 'Flags multiple system failure signals in a short time window.',
      evaluate: (events: Event[]) => {
        const failureEvents = events.filter((event) => event.type === 'system.failure');
        if (failureEvents.length < 3) {
          return null;
        }
        const timestamps = failureEvents.map((event) => new Date(event.receivedAt).getTime()).sort((a, b) => a - b);
        const withinWindow = timestamps.slice(-3).every((timestamp, index, arr) => arr[0] - timestamp <= 5 * 60 * 1000);
        if (withinWindow) {
          return {
            triggered: true,
            reason: '3 or more system.failure events occurred within 5 minutes.',
            evidence: { eventIds: failureEvents.map((event) => event.id), count: failureEvents.length, windowMs: 5 * 60 * 1000 },
          };
        }
        return null;
      },
    });

    this.registerAnomalyRule({
      id: 'repeated-identical-errors',
      name: 'Repeated identical errors',
      description: 'Flags repeated identical system errors.',
      evaluate: (events: Event[]) => {
        const grouped = new Map<string, { count: number; ids: string[] }>();
        for (const event of events) {
          if (event.type !== 'system.error') {
            continue;
          }
          const message = typeof event.data.message === 'string' ? event.data.message : JSON.stringify(event.data.message ?? event.data);
          const record = grouped.get(message) ?? { count: 0, ids: [] };
          record.count += 1;
          record.ids.push(event.id);
          grouped.set(message, record);
        }

        for (const record of grouped.values()) {
          if (record.count >= 5) {
            return {
              triggered: true,
              reason: 'The same system error message occurred 5 or more times.',
              evidence: { eventIds: record.ids, count: record.count },
            };
          }
        }
        return null;
      },
    });
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
        entityId: entityId ?? null,
        oldValues: null,
        newValues: values,
        ipAddress: 'system',
        userAgent: 'eleva-intelligence',
      })
      .catch((error: unknown) => this.logger.error(`Failed to emit M7 intelligence audit log: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}
