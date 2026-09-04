import { Test, TestingModule } from '@nestjs/testing';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { prismaRead, dbTenantContext } from '@zayjar/db';
import { MetricStatus, MemoryCategory, MemoryEvidenceClassification, EvidenceLabel } from './eleva.state';

jest.mock('@zayjar/db', () => ({
  prismaRead: {
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    branch: { findMany: jest.fn() },
    restaurant: { findMany: jest.fn() },
    table: { groupBy: jest.fn() },
  },
  dbTenantContext: {
    getStore: jest.fn(() => ({ tenantId: 'tenant-1' })),
  },
}));

describe('ElevaBusinessIntelligenceService M8 DoD', () => {
  let service: ElevaBusinessIntelligenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElevaBusinessIntelligenceService],
    }).compile();

    service = module.get<ElevaBusinessIntelligenceService>(ElevaBusinessIntelligenceService);
    (service as any).insights = new Map();
    (service as any).decisions = new Map();
    (service as any).plans = new Map();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. valid metric definitions/results', () => {
    it('should expose deterministic metric definitions for real data sources', () => {
      const definitions = service.listMetricDefinitions();

      expect(definitions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ metricId: 'sales.revenue', category: 'sales', source: expect.any(String) }),
          expect.objectContaining({ metricId: 'orders.count', category: 'orders', source: expect.any(String) }),
          expect.objectContaining({ metricId: 'performance.branch', category: 'performance', source: expect.any(String) }),
        ]),
      );
      definitions.forEach((definition) => {
        expect(definition.timeRange).toBeDefined();
        expect(definition.calculation || definition.description).toBeTruthy();
      });
    });

    it('should compute deterministic metric results without inventing numbers', async () => {
      (prismaRead.order.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: '1', total: 100, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' },
          { id: '2', total: 200, branchId: 'b1', paymentMethod: 'cash', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' },
        ])
        .mockResolvedValueOnce([{ total: 50, createdAt: new Date() }]);

      const results = await service.computeMetrics({ metricIds: ['sales.revenue', 'orders.count'] });

      expect(results).toHaveLength(2);
      const revenue = results.find((item) => item.metricId === 'sales.revenue');
      expect(revenue?.status).toBe('AVAILABLE');
      expect(revenue?.value).toBe(300);
      expect(revenue?.computedAt).toBeInstanceOf(Date);
      expect(revenue?.evidence.some((item) => item.source === 'order + payment query')).toBe(true);
      expect(revenue?.limitations.length).toBeGreaterThan(0);

      const orders = results.find((item) => item.metricId === 'orders.count');
      expect(orders?.status).toBe('AVAILABLE');
      expect(orders?.value).toBe(2);
      expect(orders?.computedAt).toBeInstanceOf(Date);
    });
  });

  describe('2. unavailable/unconfigured data providers', () => {
    it('should return UNAVAILABLE for unknown metrics without inventing values', async () => {
      const results = await service.computeMetrics({ metricIds: ['unknown.metric'] });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('UNAVAILABLE');
      expect(results[0].value).toBeNull();
      expect(results[0].evidenceStatus).toBe('UNAVAILABLE');
      expect(results[0].evidence.some((item) => item.detail?.includes('No provider'))).toBe(true);
    });

    it('should return UNAVAILABLE for explicitly disabled providers', async () => {
      const results = await service.computeMetrics({ metricIds: ['system.indicator'] });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('UNAVAILABLE');
      expect(results[0].value).toBeNull();
      expect(results[0].evidenceStatus).toBe('UNAVAILABLE');
      expect(results[0].message).toContain('wired into the ELEVA module');
    });

    it('should mark tenant-required metrics UNAVAILABLE when tenant context is missing', async () => {
      (dbTenantContext.getStore as jest.Mock).mockReturnValueOnce(null);
      const results = await service.computeMetrics({ metricIds: ['performance.branch'] });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('UNAVAILABLE');
      expect(results[0].value).toBeNull();
      expect(results[0].evidenceStatus).toBe('UNAVAILABLE');
    });
  });

  describe('3. metric source/evidence traceability', () => {
    it('should preserve evidence for every metric result and segment', async () => {
      (prismaRead.order.findMany as jest.Mock)
        .mockResolvedValueOnce([{ total: 120, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' }])
        .mockResolvedValueOnce([]);

      const results = await service.computeMetrics({ metricIds: ['sales.revenue'] });
      const revenue = results.find((item) => item.metricId === 'sales.revenue');

      expect(revenue?.evidence.length).toBeGreaterThan(0);
      expect(revenue?.evidence.every((item) => item.source && item.detail)).toBe(true);
      if (revenue?.segments) {
        expect(revenue.segments.every((segment) => segment.evidence.every((item) => item.source && item.detail))).toBe(true);
      }
    });
  });

  describe('4. period comparisons and trend analysis', () => {
    it('should compute period-over-period comparisons deterministically', async () => {
      (prismaRead.order.findMany as jest.Mock)
        .mockResolvedValueOnce([{ total: 120, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' }])
        .mockResolvedValueOnce([{ total: 60, createdAt: new Date() }]);

      const results = await service.computeMetrics({ metricIds: ['sales.revenue'] });
      const revenue = results.find((item) => item.metricId === 'sales.revenue');

      expect(revenue?.comparedToPrevious).toBeDefined();
      expect((revenue?.comparedToPrevious?.value as number | undefined)).toBe(60);
      expect((revenue?.comparedToPrevious?.change as Record<string, unknown> | undefined)?.['absolute']).toBe(60);
    });

    it('should preserve requested range period without reusing stale numbers', async () => {
      const now = new Date();
      const rangeFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const previousFrom = new Date(rangeFrom.getTime() - 7 * 24 * 60 * 60 * 1000);

      (prismaRead.order.findMany as jest.Mock)
        .mockResolvedValueOnce([{ total: 10, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(rangeFrom.getTime() + 1000), payments: [{ status: 'PAID' }], status: 'COMPLETED' }])
        .mockResolvedValueOnce([{ total: 5, createdAt: new Date(previousFrom.getTime() + 1000) }]);

      const results = await service.computeMetrics({ metricIds: ['sales.revenue'], rangeDays: 7, previousRangeDays: 7 });
      const revenue = results.find((item) => item.metricId === 'sales.revenue');

      expect(revenue?.value).toBe(10);
      expect((revenue?.comparedToPrevious?.value as number | undefined)).toBe(5);
      expect(revenue?.computedAt.getTime()).toBeGreaterThanOrEqual(rangeFrom.getTime() - 1000);
      expect(revenue?.computedAt.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    });
  });

  describe('5. segmentation where supported', () => {
    it('should segment revenue by payment method and branch without invented figures', async () => {
      (prismaRead.order.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { total: 100, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' },
          { total: 200, branchId: 'b1', paymentMethod: 'cash', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' },
        ])
        .mockResolvedValueOnce([]);

      const results = await service.computeMetrics({ metricIds: ['sales.revenue'] });
      const revenue = results.find((item) => item.metricId === 'sales.revenue');

      expect(revenue?.segments?.some((segment) => segment.segment === 'b1')).toBe(true);
      expect(revenue?.segments?.some((segment) => segment.segment === 'card:b1')).toBe(true);
      expect(revenue?.segments?.some((segment) => segment.segment === 'cash:b1')).toBe(true);
    });
  });

  describe('6. evidence-grounded insight generation', () => {
    it('should generate insights traceable to underlying metric evidence', async () => {
      (prismaRead.order.findMany as jest.Mock).mockResolvedValueOnce([{ total: 1, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' }]);
      (prismaRead.order.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const insight = await service.generateExecutiveInsight({ metricIds: ['sales.revenue'] });

      expect(insight.insightId).toBeDefined();
      expect(insight.evidence.length).toBeGreaterThan(0);
      expect(insight.evidence.every((item) => item.source && item.detail)).toBe(true);
      expect(insight.classification).toBe('inference');
      expect(insight.m7SituationId).toBeUndefined();
    });

    it('should classify unknown when no metrics are available', async () => {
      const insight = await service.generateExecutiveInsight({ observation: 'No data.', recommendation: 'Need data.' });

      expect(insight.classification).toBe('unknown');
      expect(insight.observation).toBe('No data.');
      expect(insight.evidence.some((item) => item.classification === EvidenceLabel.UNVERIFIED)).toBe(true);
    });
  });

  describe('7. fact vs inference vs unknown handling', () => {
    it('should separate verified facts from unverified inference', async () => {
      (prismaRead.order.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prismaRead.order.count as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const insight = await service.generateExecutiveInsight({ metricIds: ['sales.revenue'] });

      expect(insight.confidence).toBe('low');
      expect(insight.classification).toBe('unknown');
      expect(insight.limitations.some((item) => item.includes('unavailable'))).toBe(true);
    });
  });

  describe('8. executive insight structure', () => {
    it('should include all required fields for Executive Office visibility', async () => {
      (prismaRead.order.findMany as jest.Mock).mockResolvedValueOnce([{ total: 10, branchId: 'b1', paymentMethod: 'card', createdAt: new Date(), payments: [{ status: 'PAID' }], status: 'COMPLETED' }]);
      (prismaRead.order.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const insight = await service.generateExecutiveInsight({ metricIds: ['sales.revenue'], recommendation: 'Keep monitoring.' });

      expect(insight).toEqual(
        expect.objectContaining({
          insightId: expect.any(String),
          metricId: 'sales.revenue',
          dataSource: expect.any(String),
          observation: expect.any(String),
          timeRange: expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
          evidence: expect.any(Array),
          analysis: expect.any(String),
          impact: expect.any(String),
          confidence: expect.any(String),
          classification: expect.any(String),
          limitations: expect.any(Array),
          recommendation: 'Keep monitoring.',
          createdAt: expect.any(Date),
        }),
      );
    });
  });

  describe('9. decision-support options and recommendation', () => {
    it('should require options and never invent a recommendation', async () => {
      await expect(service.buildDecisionSupport({ question: 'Upgrade?', options: [] })).rejects.toThrow('requires at least one option');

      const decision = await service.buildDecisionSupport({
        question: 'Upgrade path?',
        options: [
          { name: 'Keep', benefits: ['Stable'], risks: [], operationalImpact: 'Low', costsEffort: 'CANNOT ESTIMATE' },
          { name: 'Change', benefits: ['Growth'], risks: [], operationalImpact: 'Medium', costsEffort: 'CANNOT ESTIMATE' },
        ],
        recommendedOption: 'Change',
        rationale: 'Growth > stability.',
      });

      expect(decision.requestId).toBeDefined();
      expect(decision.options).toHaveLength(2);
      expect(decision.recommendedOption).toBe('Change');
      expect(decision.rationale).toBe('Growth > stability.');
      expect(decision.evidence.every((item) => item.source && item.detail)).toBe(true);
    });

    it('should treat recommendation as advisory, not approval/execution', async () => {
      const decision = await service.buildDecisionSupport({
        question: 'Operational change?',
        options: [{ name: 'Hold', benefits: [], risks: [], operationalImpact: '', costsEffort: 'CANNOT ESTIMATE' }],
      });

      expect(decision.requestId).toBeDefined();
      expect(decision.recommendedOption).toBe('Hold');
      expect(decision.risks[0].mitigation).toContain('requires user approval before execution');
    });
  });

  describe('10. risk classification', () => {
    it('should require explicit risk options without inventing risk values', async () => {
      const decision = await service.buildDecisionSupport({
        question: 'Consequential change?',
        options: [
          { name: 'Low risk', benefits: [], risks: [{ classification: 'LOW', area: 'ops', triggerOrEvidence: 'small change', mitigation: 'monitor' }], operationalImpact: 'Low', costsEffort: 'CANNOT ESTIMATE' },
        ],
      });

      expect(decision.options[0].risks[0].classification).toBe('LOW');
    });
  });

  describe('11. operational planning contract', () => {
    it('should require objective, tasks, and constraints without autonomous execution', async () => {
      const plan = await service.buildOperationalPlan({
        objective: 'Roll out payment gateway.',
        affectedComponents: ['billing'],
        tasks: [{ name: 'Deploy to prod', description: 'Canary rollout.', dependencies: [] }],
        dependencies: [],
        verificationRequirements: ['Health check'],
        abortOrRollbackCriteria: ['Payment failure rate > 1%'],
      });

      expect(plan.planId).toBeDefined();
      expect(plan.objective).toBe('Roll out payment gateway.');
      expect(plan.tasks[0].name).toBe('Deploy to prod');
      expect(plan.verificationRequirements).toEqual(['Health check']);
      expect(plan.abortOrRollbackCriteria).toEqual(['Payment failure rate > 1%']);
    });
  });

  describe('12. M6 approval/execution/verification handoff', () => {
    it('should require M6 approval for consequential actions and keep recommendation/approval/execution distinct', async () => {
      const plan = await service.buildOperationalPlan({
        objective: 'Deploy payment gateway.',
        affectedComponents: ['billing'],
        tasks: [{ name: 'Deploy production payment gateway', description: 'Roll out to prod.', dependencies: [] }],
        dependencies: [],
        verificationRequirements: [],
        abortOrRollbackCriteria: [],
      });

      expect(plan.m6ApprovalRequired).toBe(true);
      expect(plan.approvalStatus).toBe('pending');
      expect(plan.m6ActionId).toBeDefined();

      const approved = await service.approveM6Plan(plan.planId, plan.m6ActionId!);
      expect(approved.approvalStatus).toBe('approved');

      const executed = await service.executeM6Plan(plan.planId, plan.m6ActionId!, async () => true);
      expect(executed.executed).toBe(true);
      expect(executed.plan.approvalStatus).toBe('verified');
    });

    it('should fail verification when verifier rejects execution', async () => {
      const plan = await service.buildOperationalPlan({
        objective: 'Deploy payment gateway.',
        affectedComponents: ['billing'],
        tasks: [{ name: 'Deploy production payment gateway', description: 'Roll out to prod.', dependencies: [] }],
        dependencies: [],
        verificationRequirements: [],
        abortOrRollbackCriteria: [],
      });

      await service.approveM6Plan(plan.planId, plan.m6ActionId!);
      const executed = await service.executeM6Plan(plan.planId, plan.m6ActionId!, async () => false);

      expect(executed.executed).toBe(false);
      expect(executed.plan.approvalStatus).toBe('failed');
    });

    it('should never execute a sensitive plan without approval', async () => {
      const plan = await service.buildOperationalPlan({
        objective: 'Deploy payment gateway.',
        affectedComponents: ['billing'],
        tasks: [{ name: 'Deploy production payment gateway', description: 'Roll out to prod.', dependencies: [] }],
        dependencies: [],
        verificationRequirements: [],
        abortOrRollbackCriteria: [],
      });

      await expect(service.executeM6Plan(plan.planId, plan.m6ActionId!, async () => true)).rejects.toThrow('not approved');
    });
  });

  describe('13. M7 situation consumption', () => {
    it('should consume M7 situations into executive insights when linked', async () => {
      (service as any).intelligenceService = {
        listSituations: jest.fn().mockResolvedValue([{ id: 'sit-1', state: 'open', severity: 'high', recommendations: [{ summary: 'Review ops', approvalRequired: false, risk: { area: 'ops' }, proposedAction: 'Review' }], evidence: [], detectedAt: new Date(), lastUpdatedAt: new Date() }]),
      };

      const insights = await service.consumeM7SituationsIntoInsights();

      expect(insights).toHaveLength(1);
      expect(insights[0].m7SituationId).toBe('sit-1');
      expect(insights[0].observation).toContain('M7 situation');
    });

    it('should handle missing situations without inventing analysis', async () => {
      (service as any).intelligenceService = {
        listSituations: jest.fn().mockResolvedValue([]),
      };

      const insights = await service.consumeM7SituationsIntoInsights();

      expect(insights).toEqual([]);
    });
  });

  describe('14. memory/history reuse', () => {
    it('should reuse memory context for metric history without inventing numbers', async () => {
      const memoryStore = new Map<string, { type: string; createdAt: Date }>([
        ['metric-history', { type: 'metric-history', createdAt: new Date() }],
      ]);
      (service as any).memoryService = {
        retrieveMemories: jest.fn(async ({ category }: { category: string }) =>
          memoryStore.has(category) ? [memoryStore.get(category)!] : [],
        ),
        storeMemory: jest.fn(),
      };

      const context = await service.getBusinessIntelligenceContext();

      expect(context.metrics).toBeDefined();
    });

    it('should preserve business memory for decisions and plans', async () => {
      const decision = await service.buildDecisionSupport({
        question: 'Memory test?',
        options: [{ name: 'A', benefits: [], risks: [], operationalImpact: '', costsEffort: 'CANNOT ESTIMATE' }],
      });
      const memory = (service as any).memoryService?.retrieveMemories?.({ category: MemoryCategory.DECISION, tag: decision.requestId });

      expect(memory).toBeDefined();
    });
  });

  describe('15. Executive Office visibility', () => {
    it('should surface metrics, insights, decisions, plans, situations, and approvals', async () => {
      const context = await service.getBusinessIntelligenceContext();

      expect(context).toEqual(
        expect.objectContaining({
          metrics: expect.any(Array),
          insights: expect.any(Array),
          decisions: expect.any(Array),
          plans: expect.any(Array),
          pendingApprovals: expect.any(Array),
          m7Situations: expect.any(Array),
          generatedAt: expect.any(Date),
        }),
      );
    });

    it('should keep recommendation, approval, execution, verification, and outcome distinct', async () => {
      const decision = await service.buildDecisionSupport({
        question: 'Strategy?',
        options: [{ name: 'Keep', benefits: [], risks: [], operationalImpact: '', costsEffort: 'CANNOT ESTIMATE' }],
        recommendedOption: 'Keep',
      });
      const plan = await service.buildOperationalPlan({
        objective: 'Execute Keep strategy.',
        affectedComponents: ['strategy'],
        tasks: [{ name: 'Review strategy', description: 'Do not deploy.', dependencies: [] }],
        dependencies: [],
        verificationRequirements: [],
        abortOrRollbackCriteria: [],
      });

      expect(decision.requestId).toBeDefined();
      expect(decision.recommendedOption).toBe('Keep');
      expect(plan.m6ApprovalRequired).toBe(false);
      expect(plan.approvalStatus).toBe('approved');
    });
  });
});
