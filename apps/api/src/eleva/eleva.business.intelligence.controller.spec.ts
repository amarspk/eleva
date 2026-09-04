import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ElevaBusinessIntelligenceController } from './eleva.business.intelligence.controller';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';
import { MetricStatus, ExecutiveInsight } from './eleva.state';

describe('ElevaBusinessIntelligenceController', () => {
  let controller: ElevaBusinessIntelligenceController;
  let service: jest.Mocked<ElevaBusinessIntelligenceService>;

  const mockJwtAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRbacPermissionGuard = { canActivate: jest.fn(() => true) };

  const buildContext = (overrides: { metrics?: any[]; insights?: ExecutiveInsight[]; m7Situations?: Array<{ situationId: string; state?: string; severity?: string; recommendationCount?: number }> } = {}) => ({
    metrics: overrides.metrics ?? [],
    insights: overrides.insights ?? [],
    decisions: [],
    plans: [],
    pendingApprovals: [],
    m7Situations: overrides.m7Situations ?? [],
    memory: [],
    generatedAt: new Date(),
  }) as any;

  const buildDecision = (overrides: any = {}) => ({
    requestId: 'decision-1',
    question: 'What should we do?',
    currentState: 'Current state.',
    evidence: [],
    options: [],
    recommendedOption: 'option-a',
    rationale: 'Rationale.',
    risks: [],
    operationalImpact: 'Low impact.',
    technicalImpact: 'No code changes.',
    createdAt: new Date('2026-09-01T04:00:00.000Z'),
    ...overrides,
  });

  const buildPlan = (overrides: any = {}) => ({
    planId: 'plan-1',
    objective: 'Improve ops.',
    affectedComponents: [],
    tasks: [],
    dependencies: [],
    verificationRequirements: [],
    abortOrRollbackCriteria: [],
    m6ApprovalRequired: true,
    m6ActionId: 'm6-action-1',
    approvalStatus: 'pending',
    createdAt: new Date('2026-09-01T04:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    service = {
      getBusinessIntelligenceContext: jest.fn(),
      buildDecisionSupport: jest.fn(),
      buildOperationalPlan: jest.fn(),
    } as unknown as jest.Mocked<ElevaBusinessIntelligenceService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElevaBusinessIntelligenceController],
      providers: [ElevaBusinessIntelligenceService],
    })
      .overrideProvider(ElevaBusinessIntelligenceService)
      .useValue(service)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RbacPermissionGuard)
      .useValue(mockRbacPermissionGuard)
      .overrideProvider(Reflector)
      .useValue({ get: jest.fn(), getAll: jest.fn(), getAllAndOverride: jest.fn() })
      .overrideProvider(CaslAbilityFactory)
      .useValue({ createForUser: jest.fn() })
      .compile();

    controller = module.get<ElevaBusinessIntelligenceController>(ElevaBusinessIntelligenceController);
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /metrics should return business intelligence context', async () => {
    service.getBusinessIntelligenceContext.mockResolvedValue(buildContext({ metrics: [{ metricId: 'sales.revenue', value: 10, status: MetricStatus.AVAILABLE, evidenceStatus: MetricStatus.AVAILABLE, evidence: [], limitations: [], computedAt: new Date() }] }) as any);
    const response = await controller.getMetrics({ user: { id: 'user-1' } } as any);

    expect(response.metrics).toEqual([{ metricId: 'sales.revenue', value: 10, status: MetricStatus.AVAILABLE, evidenceStatus: MetricStatus.AVAILABLE, evidence: [], limitations: [], computedAt: expect.any(Date) }]);
    expect(service.getBusinessIntelligenceContext).toHaveBeenCalledTimes(1);
  });

  it('GET /metrics/:metricId should return business intelligence context', async () => {
    service.getBusinessIntelligenceContext.mockResolvedValue(buildContext({ metrics: [{ metricId: 'orders.count', value: 2, status: MetricStatus.AVAILABLE, evidenceStatus: MetricStatus.AVAILABLE, evidence: [], limitations: [], computedAt: new Date() }] }) as any);
    const response = await controller.getMetric({ user: { id: 'user-1' } } as any, 'metric-1');

    expect(response.metrics).toEqual([{ metricId: 'orders.count', value: 2, status: MetricStatus.AVAILABLE, evidenceStatus: MetricStatus.AVAILABLE, evidence: [], limitations: [], computedAt: expect.any(Date) }]);
  });

  it('GET /insights should return extracted insights', async () => {
    const insight = { insightId: 'insight-1', dataSource: 'ds', observation: 'obs', timeRange: { from: new Date(), to: new Date() }, evidence: [], analysis: 'analysis', impact: 'impact', confidence: 'low', classification: 'unknown', limitations: [], recommendation: 'rec', createdAt: new Date() } as ExecutiveInsight;
    service.getBusinessIntelligenceContext.mockResolvedValue(buildContext({ insights: [insight] }) as any);
    const response = await controller.getInsights({ user: { id: 'user-1' } } as any);

    expect(response).toEqual([{ insightId: 'insight-1', dataSource: 'ds', observation: 'obs', timeRange: expect.any(Object), evidence: [], analysis: 'analysis', impact: 'impact', confidence: 'low', classification: 'unknown', limitations: [], recommendation: 'rec', createdAt: expect.any(Date) }]);
  });

  it('POST /decision-support should return normalized decision package', async () => {
    service.buildDecisionSupport.mockResolvedValue(buildDecision({ recommendedOption: 'option-b' }));
    const response = await controller.getDecisionSupport(
      { user: { id: 'user-1' } } as any,
      { question: 'Upgrade path?', options: [{ name: 'option-b' }] },
    );

    expect(response.requestId).toBe('decision-1');
    expect((response as any).recommendation.recommendedOption).toBe('option-b');
  });

  it('POST /plans should return plan summary with approval fields', async () => {
    service.buildOperationalPlan.mockResolvedValue(buildPlan({ planId: 'plan-2', m6ApprovalRequired: false }));
    const response = await controller.createPlan(
      { user: { id: 'user-1' } } as any,
      { objective: 'Deploy feature.', affectedComponents: ['api'], tasks: [{ name: 'task-1' }], dependencies: [], verificationRequirements: [], abortOrRollbackCriteria: [] },
    );

    expect(response.planId).toBe('plan-2');
    expect(response.m6ApprovalRequired).toBe(false);
  });

  it('GET /situations should return extracted situations', async () => {
    service.getBusinessIntelligenceContext.mockResolvedValue(buildContext({ m7Situations: [{ situationId: 'sit-1', state: 'open', severity: 'high', recommendationCount: 1 }] }) as any);
    const response = await controller.getSituations({ user: { id: 'user-1' } } as any);

    expect(response).toEqual([{ situationId: 'sit-1', state: 'open', severity: 'high', recommendationCount: 1 }]);
  });
});
