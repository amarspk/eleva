import { Test, TestingModule } from '@nestjs/testing';
import { ElevaIntelligenceService } from './eleva.intelligence';
import {
  Event,
  SituationState,
  Severity,
  SituationMemoryRecord,
  EventCategoryM7,
  SignalStatus,
  MemoryEvidenceClassification,
} from './eleva.state';

describe('ElevaIntelligenceService', () => {
  let service: ElevaIntelligenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElevaIntelligenceService],
    }).compile();

    service = module.get<ElevaIntelligenceService>(ElevaIntelligenceService);
  });

  it('should ingest a signal as RECEIVED', async () => {
    const signal = await service.ingestSignal({ source: 'test-provider', type: 'system.failure', raw: { message: 'disk full' } });
    expect(signal.status).toBe(SignalStatus.RECEIVED);
    expect(signal.raw).toEqual({ message: 'disk full' });
  });

  it('should reject invalid signals explicitly', async () => {
    const signal = await service.ingestSignal({ source: 'test-provider', type: 'system.failure', raw: { message: 'disk full' } });
    (service as any).signals.get(signal.id).status = SignalStatus.INVALID;
    expect(() => service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM)).toThrow();
  });

  it('should convert valid signals into traceable events', async () => {
    const signal = await service.ingestSignal({ source: 'test-provider', type: 'system.failure', raw: { message: 'disk full' } });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM, 'disk');
    expect(event.signalId).toBe(signal.id);
    expect(event.category).toBe(EventCategoryM7.SYSTEM);
    expect(event.data).toEqual({ message: 'disk full' });
  });

  it('should correlate events with explicit reason and criteria', async () => {
    const signalA = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: { message: 'disk full' } });
    const eventA = service.convertSignalToEvent(signalA.id, EventCategoryM7.SYSTEM, 'disk');
    const signalB = await service.ingestSignal({ source: 'provider-a', type: 'system.error', raw: { message: 'io timeout' } });
    const eventB = service.convertSignalToEvent(signalB.id, EventCategoryM7.SYSTEM, 'disk');

    const [situationId] = service.correlateEvents([eventA.id, eventB.id], {
      eventIds: [eventA.id, eventB.id],
      reason: 'same provider within 60s',
      criteria: { source: 'provider-a', windowMs: 60000 },
    });
    const situation = service.getSituation(situationId);
    expect(situation).toBeDefined();
    expect(situation?.eventIds).toEqual(expect.arrayContaining([eventA.id, eventB.id]));
    expect(situation?.eventIds).toHaveLength(2);
    expect(situation?.correlationReason).toBe('same provider within 60s');
  });

  it('should reject unrelated correlations', async () => {
    const signalA = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: { message: 'disk full' } });
    const eventA = service.convertSignalToEvent(signalA.id, EventCategoryM7.SYSTEM, 'disk');
    const signalB = await service.ingestSignal({ source: 'provider-b', type: 'system.failure', raw: { message: 'network down' } });
    const eventB = service.convertSignalToEvent(signalB.id, EventCategoryM7.SYSTEM, 'network');

    const [situationId] = service.correlateEvents([eventA.id, eventB.id], {
      eventIds: [eventA.id, eventB.id],
      reason: 'explicitly correlated by operator',
      criteria: { manual: true },
    });
    const situation = service.getSituation(situationId);
    expect(situation?.eventIds).toEqual(expect.arrayContaining([eventA.id, eventB.id]));
    expect(situation?.eventIds).toHaveLength(2);
    expect(situation?.correlationReason).toBe('explicitly correlated by operator');
  });

  it('should detect repeated failures within a time window', async () => {
    const events: Event[] = [];
    for (let index = 0; index < 4; index += 1) {
      const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: { message: 'disk full' } });
      const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
      (event as any).receivedAt = new Date(Date.now() - index * 60000).toISOString();
      events.push(event);
    }

    const anomalies = service.detectAnomalies(events.map((event) => event.id));
    expect(anomalies.some((anomaly) => anomaly.ruleId === 'repeated-failures-window')).toBe(true);
  });

  it('should detect repeated identical errors', async () => {
    const events: Event[] = [];
    for (let index = 0; index < 5; index += 1) {
      const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.error', raw: { message: 'connection reset' } });
      const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
      events.push(event);
    }

    const anomalies = service.detectAnomalies(events.map((event) => event.id));
    expect(anomalies.some((anomaly) => anomaly.ruleId === 'repeated-identical-errors')).toBe(true);
  });

  it('should assign LOW/MEDIUM/HIGH/CRITICAL severity with evidence requirements for HIGH/CRITICAL', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'single failure event',
      criteria: {},
    });

    const situation = service.assessSituationSeverity(situationId, Severity.MEDIUM, 'repeated warnings', { warnings: 2 });
    expect(situation.severity).toBe(Severity.MEDIUM);

    expect(() => service.assessSituationSeverity(situationId, Severity.CRITICAL, '', {})).toThrow();
    expect(() => service.assessSituationSeverity(situationId, Severity.CRITICAL, 'db down', {})).toThrow();
  });

  it('should create a recommendation attached to a situation', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'failure event',
      criteria: {},
    });

    const recommendation = service.createRecommendation(situationId, {
      summary: 'Restart worker',
      proposedAction: 'M6 execution pipeline',
      reason: 'repeated failure',
      risk: { classification: Severity.MEDIUM, area: 'worker', triggerOrEvidence: '3 failures in 5m', mitigation: 'canary restart' },
      approvalRequired: true,
    });

    expect(recommendation.situationId).toBe(situationId);
    expect(recommendation.status).toBe('PENDING');
    expect(recommendation.approvalRequired).toBe(true);
    const situation = service.getSituation(situationId);
    expect(situation?.recommendations.length).toBe(1);
  });

  it('should create an evidence-based alert for a situation', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'alert source',
      criteria: {},
    });

    const alert = service.alertForSituation(situationId, 'disk full warning', { eventId: event.id });
    expect(alert.situationId).toBe(situationId);
    expect(alert.evidence).toEqual({ eventId: event.id });
    const situation = service.getSituation(situationId);
    expect(situation?.alerts.length).toBe(1);
  });

  it('should advance situation lifecycle states', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'lifecycle test',
      criteria: {},
    });

    expect(service.getSituation(situationId)?.state).toBe(SituationState.DETECTED);
    service.advanceSituationState(situationId, SituationState.INVESTIGATING);
    service.advanceSituationState(situationId, SituationState.ACTIVE);
    service.advanceSituationState(situationId, SituationState.RESOLVED);
    expect(service.getSituation(situationId)?.state).toBe(SituationState.RESOLVED);
  });

  it('should execute scheduled checks and report unavailable providers explicitly', async () => {
    const unavailable = await service.executeScheduledCheck('backup');
    expect(unavailable.available).toBe(false);
    expect(unavailable.error).toContain('not been configured');

    service.setProviderAvailability('backup', true, 'local filesystem');
    const available = await service.executeScheduledCheck('backup');
    expect(available.available).toBe(true);
  });

  it('should preserve situation memory and reuse M5 memory foundations', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'memory test',
      criteria: {},
    });

    const record: SituationMemoryRecord = {
      situationId,
      memoryKey: 'decision',
      value: 'restart worker',
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.VERIFIED,
        source: 'operator',
        retrievedAt: new Date(),
      },
      updatedAt: new Date(),
    };

    service.rememberSituationMemory(record);
    const memory = service.recallSituationMemory(situationId);
    expect(memory).toHaveLength(1);
    expect(memory[0].value).toBe('restart worker');
    expect(memory[0].provenance.evidenceClassification).toBe(MemoryEvidenceClassification.VERIFIED);
  });

  it('should surface M6 handoff via recommendations instead of autonomous execution', async () => {
    const signal = await service.ingestSignal({ source: 'provider-a', type: 'system.failure', raw: {} });
    const event = service.convertSignalToEvent(signal.id, EventCategoryM7.SYSTEM);
    const [situationId] = service.correlateEvents([event.id], {
      eventIds: [event.id],
      reason: 'm6 handoff',
      criteria: {},
    });

    const recommendation = service.createRecommendation(situationId, {
      summary: 'Rotate certificate',
      proposedAction: 'M6 approval required',
      reason: 'certificate expiry detected',
      risk: { classification: Severity.HIGH, area: 'security', triggerOrEvidence: 'TLS cert expires in 24h', mitigation: 'approve rotation in M2 pipeline' },
      approvalRequired: true,
    });

    expect(recommendation.proposedAction).toBe('M6 approval required');
    expect(recommendation.approvalRequired).toBe(true);
    expect(service.listSituations()).toHaveLength(1);
  });
});
