import { Injectable, Logger, Optional } from '@nestjs/common';
import { prismaRead, dbTenantContext } from '@zayjar/db';
import { AuditService } from '../audit/audit.service';
import {
  MetricStatus,
  MetricDefinition,
  MetricResult,
  ExecutiveInsight,
  DecisionSupportRequest,
  OperationalPlan,
  BusinessIntelligenceContext,
  EvidenceLabel,
  MemoryEvidenceClassification,
  MemoryCategory,
} from './eleva.state';
import { ElevaIntelligenceService } from './eleva.intelligence';
import { ElevaMemoryService } from './eleva.memory';
import { ElevaService } from './eleva.service';

export type M8MetricProvider = {
  readonly name: string;
  readonly metric: MetricDefinition;
  readonly available: boolean;
  readonly unavailabilityReason?: string;
  compute(context: M8ComputationContext): Promise<MetricResult>;
};

export interface M8ComputationContext {
  now: Date;
  range: { from: Date; to: Date };
  previousRange: { from: Date; to: Date };
  segments: string[];
}

const DEFAULT_RANGE_DAYS = 30;

// ==========================================
// Built-in deterministic metric providers
// ==========================================

const salesRevenueProvider: M8MetricProvider = {
  name: 'sales.revenue',
  metric: {
    metricId: 'sales.revenue',
    name: 'Sales / revenue',
    description: 'Total revenue for completed or paid orders in the requested range.',
    category: 'sales',
    source: 'Order + Payment',
    calculation: 'Sum(order.total) for paid terminal orders within the requested range.',
    segmentation: ['branchId', 'paymentMethod'],
    timeRange: { from: new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: new Date() },
    evidenceStatus: MetricStatus.AVAILABLE,
    evidence: [{ source: 'order.service.ts checkout flow', detail: 'order.total is authoritative at creation time.' }],
    limitations: ['Partial refunds are not reverse-computed here; see refund workflow.'],
  },
  available: true,
  async compute(context: M8ComputationContext): Promise<MetricResult> {
    const { range, previousRange } = context;
    const tenantId = dbTenantContext.getStore()?.tenantId;
    const paymentStatuses = ['PAID'] as const;
    const baseWhere: Record<string, unknown> = {
      ...(tenantId ? { tenantId } : {}),
      createdAt: { gte: range.from, lte: range.to },
      payments: { some: { status: { in: paymentStatuses } } },
      status: { in: ['COMPLETED', 'CANCELLED', 'REFUNDED'] },
    };

    const [orders, previousOrders] = await Promise.all([
      prismaRead.order.findMany({
        where: baseWhere,
        select: { id: true, total: true, branchId: true, paymentMethod: true },
      }),
      prismaRead.order.findMany({
        where: { ...baseWhere, createdAt: { gte: previousRange.from, lte: previousRange.to } },
        select: { total: true },
      }),
    ]);

    const value = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const previousValue = previousOrders.reduce((sum, order) => sum + Number(order.total), 0);

    const segmentTotals = new Map<string, { value: number; method: string }>();
    for (const order of orders) {
      const branchKey = String(order.branchId ?? 'unknown');
      const methodKey = String(order.paymentMethod ?? 'unknown');
      const branchEntry = segmentTotals.get(branchKey) ?? { value: 0, method: 'branch' };
      branchEntry.value += Number(order.total);
      segmentTotals.set(branchKey, branchEntry);

      const methodEntryKey = `${methodKey}:${branchKey}`;
      const methodEntry = segmentTotals.get(methodEntryKey) ?? { value: 0, method: 'paymentMethod' };
      methodEntry.value += Number(order.total);
      segmentTotals.set(methodEntryKey, methodEntry);
    }

    const segmentResults: MetricResult['segments'] = [];
    for (const [segment, entry] of segmentTotals.entries()) {
      segmentResults.push({
        segment,
        value: entry.value,
        status: MetricStatus.AVAILABLE,
        evidenceStatus: MetricStatus.AVAILABLE,
        evidence: [{ source: 'order.service.ts checkout flow', detail: `Segment ${segment} derived from filtered order total.` }],
        limitations: ['Segmentation is only as complete as current order records.'],
        computedAt: new Date(),
      });
    }

    return {
      metricId: this.metric.metricId,
      value,
      unit: 'money',
      status: MetricStatus.AVAILABLE,
      evidenceStatus: MetricStatus.AVAILABLE,
      comparedToPrevious: { value: previousValue, change: { absolute: value - previousValue, relative: previousValue ? (value - previousValue) / previousValue : null } },
      segments: segmentResults,
      evidence: [{ source: 'order + payment query', detail: 'Revenue requires paid terminal orders.' }],
      limitations: ['Missing payment rows are treated as non-revenue.'],
      computedAt: new Date(),
    } as MetricResult;
  },
};

const orderCountProvider: M8MetricProvider = {
  name: 'orders.count',
  metric: {
    metricId: 'orders.count',
    name: 'Order count',
    description: 'Number of orders placed in the requested range.',
    category: 'orders',
    source: 'Order',
    calculation: 'count(orders) in the requested range.',
    segmentation: ['branchId', 'status'],
    timeRange: { from: new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: new Date() },
    evidenceStatus: MetricStatus.AVAILABLE,
    evidence: [{ source: 'order.repository', detail: 'Count is sourced from the order table.' }],
    limitations: ['Count includes all statuses unless further filtered.'],
  },
  available: true,
  async compute(context: M8ComputationContext): Promise<MetricResult> {
    const { range, previousRange } = context;
    const tenantId = dbTenantContext.getStore()?.tenantId;
    const baseWhere: Record<string, unknown> = {
      ...(tenantId ? { tenantId } : {}),
      createdAt: { gte: range.from, lte: range.to },
    };

    const [count, previousCount, statusCounts = []] = await Promise.all([
      prismaRead.order.count({ where: baseWhere }),
      prismaRead.order.count({ where: { ...baseWhere, createdAt: { gte: previousRange.from, lte: previousRange.to } } }),
      prismaRead.order.findMany({ where: baseWhere, select: { status: true, branchId: true } }),
    ]);

    const segmentResults: MetricResult['segments'] = [];
    const seen = new Set<string>();
    for (const row of statusCounts) {
      const segment = `${row.branchId ?? 'unknown'}:${row.status}`;
      if (seen.has(segment)) {
        continue;
      }
      seen.add(segment);
      const countForSegment = statusCounts.filter((item) => item.branchId === row.branchId && item.status === row.status).length;
      segmentResults.push({
        segment,
        value: countForSegment,
        status: MetricStatus.AVAILABLE,
        evidenceStatus: MetricStatus.AVAILABLE,
        evidence: [{ source: 'order.findMany', detail: `Status segment ${row.status}.` }],
        limitations: ['Segmentation is derived from in-memory filtering.'],
        computedAt: new Date(),
      });
    }

    return {
      metricId: this.metric.metricId,
      value: count,
      status: MetricStatus.AVAILABLE,
      evidenceStatus: MetricStatus.AVAILABLE,
      comparedToPrevious: { value: previousCount, change: { absolute: count - previousCount, relative: previousCount ? (count - previousCount) / previousCount : null } },
      segments: segmentResults,
      evidence: [{ source: 'order.count', detail: 'Order count is deterministic from order rows.' }],
      limitations: ['Order count alone does not imply revenue.'],
      computedAt: new Date(),
    } as MetricResult;
  },
};

const branchPerformanceProvider: M8MetricProvider = {
  name: 'performance.branch',
  metric: {
    metricId: 'performance.branch',
    name: 'Branch performance',
    description: 'Operational performance by branch using active tables and restaurant count.',
    category: 'performance',
    source: 'Branch + Restaurant + Table',
    calculation: 'active table count and active restaurant count per tenant branch.',
    segmentation: ['branchId'],
    timeRange: { from: new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: new Date() },
    evidenceStatus: MetricStatus.AVAILABLE,
    evidence: [{ source: 'branch + restaurant + table tables', detail: 'Performance is structural rather than revenue-derived.' }],
    limitations: ['Does not include kitchen queue throughput or labor metrics.'],
  },
  available: true,
  async compute(_context: M8ComputationContext): Promise<MetricResult> {
    const tenantId = dbTenantContext.getStore()?.tenantId;
    if (!tenantId) {
      return {
        metricId: this.metric.metricId,
        value: null,
        status: MetricStatus.UNAVAILABLE,
        message: 'Branch performance requires a tenant context.',
        evidenceStatus: MetricStatus.UNAVAILABLE,
        evidence: [],
        limitations: ['Tenant context missing.'],
        comparedToPrevious: undefined,
        segments: [],
        computedAt: new Date(),
      } as MetricResult;
    }

    const branches = await prismaRead.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, restaurantId: true },
    });

    const restaurantIds = Array.from(new Set(branches.map((branch) => branch.restaurantId)));
    const restaurants = await prismaRead.restaurant.findMany({ where: { id: { in: restaurantIds } }, select: { id: true, name: true } });
    const tableCounts = (await prismaRead.table.groupBy({
      by: ['branchId'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    })) ?? [];

    const restaurantName = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name]));
    const tableMap = new Map(tableCounts.map((row) => [row.branchId, row._count._all]));

    const segments = branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      restaurantName: restaurantName.get(branch.restaurantId) ?? null,
      tableCount: tableMap.get(branch.id) ?? 0,
    }));

    return {
      metricId: this.metric.metricId,
      value: segments.length ? segments : null,
      status: MetricStatus.AVAILABLE,
      evidenceStatus: MetricStatus.AVAILABLE,
      comparedToPrevious: undefined,
      segments: segments.map((segment) => ({
        segment: segment.branchId,
        value: segment,
        status: MetricStatus.AVAILABLE,
        evidenceStatus: MetricStatus.AVAILABLE,
        evidence: [{ source: 'branch/table query', detail: `Table count for branch ${segment.branchId}.` }],
        limitations: ['Operational throughput is not measured.'],
        computedAt: new Date(),
      })),
      evidence: [{ source: 'branch/restaurant/table query', detail: 'Performance is based on active branch/table data.' }],
      limitations: ['No revenue or queue throughput is included.'],
      computedAt: new Date(),
    } as MetricResult;
  },
};

const systemIndicatorProvider: M8MetricProvider = {
  name: 'system.indicator',
  metric: {
    metricId: 'system.indicator',
    name: 'System/platform indicator',
    description: 'Explicitly unavailable unless a real provider is wired into ElevaOperationalService.',
    category: 'system',
    source: 'ElevaOperationalService',
    calculation: 'UNVERIFIED — provider must provide deterministic status.',
    segmentation: [],
    timeRange: { from: new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: new Date() },
    evidenceStatus: MetricStatus.UNAVAILABLE,
    limitations: ['No system provider is currently wired into the ELEVA module.'],
  },
  available: false,
  unavailabilityReason: 'No repository system indicator provider is currently wired into the ELEVA module.',
  async compute() {
    return {
      metricId: this.metric.metricId,
      value: null,
      status: MetricStatus.UNAVAILABLE,
      message: this.unavailabilityReason,
      evidenceStatus: MetricStatus.UNAVAILABLE,
      evidence: [{ source: 'eleva.operations.ts default provider', detail: this.unavailabilityReason }],
      limitations: ['Connect a real provider before using this metric.'],
      comparedToPrevious: undefined,
      segments: [],
      computedAt: new Date(),
    } as MetricResult;
  },
};

// ==========================================
// Service
// ==========================================

@Injectable()
export class ElevaBusinessIntelligenceService {
  private readonly logger = new Logger(ElevaBusinessIntelligenceService.name);
  private readonly metrics = new Map<string, M8MetricProvider>([
    [salesRevenueProvider.metric.metricId, salesRevenueProvider],
    [orderCountProvider.metric.metricId, orderCountProvider],
    [branchPerformanceProvider.metric.metricId, branchPerformanceProvider],
    [systemIndicatorProvider.metric.metricId, systemIndicatorProvider],
  ]);
  private readonly insights = new Map<string, ExecutiveInsight>();
  private readonly decisions = new Map<string, DecisionSupportRequest>();
  private readonly plans = new Map<string, OperationalPlan>();

  constructor(
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly intelligenceService?: ElevaIntelligenceService,
    @Optional() private readonly memoryService?: ElevaMemoryService,
    @Optional() private readonly agentService?: ElevaService,
  ) {}

  listMetricDefinitions(availableOnly = false): MetricDefinition[] {
    return Array.from(this.metrics.values())
      .filter((provider) => !availableOnly || provider.available)
      .map((provider) => ({ ...provider.metric, timeRange: { ...provider.metric.timeRange }, evidence: provider.metric.evidence?.map((item) => ({ ...item })) }));
  }

  async computeMetrics(options: { rangeDays?: number; previousRangeDays?: number; metricIds?: string[] } = {}): Promise<MetricResult[]> {
    const now = new Date();
    const rangeDays = options.rangeDays ?? DEFAULT_RANGE_DAYS;
    const previousRangeDays = options.previousRangeDays ?? DEFAULT_RANGE_DAYS;
    const range = { from: new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000), to: now };
    const previousRange = { from: new Date(range.from.getTime() - previousRangeDays * 24 * 60 * 60 * 1000), to: range.from };
    const context: M8ComputationContext = { now, range, previousRange, segments: ['branchId'] };
    const metricIds = options.metricIds?.length ? options.metricIds : Array.from(this.metrics.keys());

    const results = await Promise.all(
      metricIds.map(async (metricId) => {
        const provider = this.metrics.get(metricId);
        if (!provider) {
          return {
            metricId,
            value: null,
            status: MetricStatus.UNAVAILABLE,
            message: `Metric [${metricId}] is not defined.`,
            evidenceStatus: MetricStatus.UNAVAILABLE,
            evidence: [{ source: 'ElevaBusinessIntelligenceService', detail: `No provider is registered for ${metricId}.` }],
            limitations: ['Use listMetricDefinitions for available metrics.'],
            computedAt: now,
          } as MetricResult;
        }

        if (!provider.available) {
          return {
            metricId: provider.metric.metricId,
            value: null,
            status: MetricStatus.UNAVAILABLE,
            message: provider.unavailabilityReason ?? 'This metric provider is unavailable.',
            evidenceStatus: MetricStatus.UNAVAILABLE,
            evidence: provider.metric.evidence?.length ? provider.metric.evidence : [{ source: provider.name, detail: provider.unavailabilityReason ?? 'Provider unavailable.' }],
            limitations: provider.metric.limitations ?? [],
            computedAt: now,
          } as MetricResult;
        }

        try {
          return await provider.compute(context);
        } catch (error) {
          this.logger.error(`M8 metric computation failed for ${metricId}: ${error instanceof Error ? error.message : 'unknown'}`);
          return {
            metricId: provider.metric.metricId,
            value: null,
            status: MetricStatus.UNVERIFIED,
            message: `Metric computation failed: ${error instanceof Error ? error.message : 'unknown'}`,
            evidenceStatus: MetricStatus.UNVERIFIED,
            evidence: [{ source: provider.name, detail: 'Computation failed at runtime.' }],
            limitations: provider.metric.limitations ?? ['Computation failed.'],
            computedAt: now,
          } as MetricResult;
        }
      }),
    );

    await this.rememberBusinessMemory('latest-metrics', { metricIds: results.map((result) => result.metricId), range });
    this.emitAudit('AGENT.M8.METRICS_COMPUTED', 'ElevaBusinessMetric', undefined, { metricIds: results.map((result) => result.metricId), statuses: results.map((result) => result.status) });
    return results;
  }

  async generateExecutiveInsight(input: { metricIds?: string[]; situationId?: string; observation?: string; recommendation?: string } = {}): Promise<ExecutiveInsight> {
    const metrics = input.metricIds?.length ? await this.computeMetrics({ metricIds: input.metricIds }) : [];
    const availableMetrics = metrics.filter((metric) => metric.status === MetricStatus.AVAILABLE);
    const unavailableMetrics = metrics.filter((metric) => metric.status !== MetricStatus.AVAILABLE);

    const insightId = this.generateId('insight');
    const observation = input.observation ?? this.buildDefaultObservation(availableMetrics, unavailableMetrics);
    const analysis = this.buildAnalysis(availableMetrics, unavailableMetrics);
    const confidence = availableMetrics.length ? 'medium' : 'low';
    const classification: ExecutiveInsight['classification'] = availableMetrics.length ? 'inference' : 'unknown';
    const now = new Date();

    const insight: ExecutiveInsight = {
      insightId,
      metricId: metrics[0]?.metricId,
      dataSource: metrics.map((metric) => metric.metricId).join(', ') || 'none',
      observation,
      timeRange: { from: new Date(now.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000), to: now },
      evidence: [
        ...metrics.flatMap((metric) => metric.evidence.map((evidence) => ({ source: evidence.source, detail: evidence.detail ?? '', classification: EvidenceLabel.VERIFIED }))),
        ...(unavailableMetrics.length ? [{ source: 'eleva-business-intelligence', detail: 'Some requested metrics were unavailable and were not invented.', classification: EvidenceLabel.UNVERIFIED }] : []),
      ],
      analysis,
      impact: analysis,
      confidence,
      classification,
      limitations: [
        ...metrics.flatMap((metric) => metric.limitations ?? []),
        ...(unavailableMetrics.length ? ['Unavailable metrics were explicitly excluded.'] : []),
      ],
      recommendation: input.recommendation ?? this.buildRecommendation(availableMetrics),
      m7SituationId: input.situationId,
      createdAt: now,
    };

    this.insights.set(insightId, insight);
    await this.rememberBusinessMemory(insightId, { type: 'insight', observation, recommendation: insight.recommendation });
    this.emitAudit('AGENT.M8.INSIGHT_CREATED', 'ElevaExecutiveInsight', insightId, { metricIds: metrics.map((metric) => metric.metricId), classification, confidence });
    return insight;
  }

  async buildDecisionSupport(input: { question: string; options: DecisionSupportRequest['options']; recommendedOption?: string; rationale?: string } = { question: '', options: [] }): Promise<DecisionSupportRequest> {
    if (!input.options.length) {
      throw new Error('Decision support requires at least one option.');
    }

    const request: DecisionSupportRequest = {
      requestId: this.generateId('decision'),
      question: input.question,
      currentState: 'Current state was not supplied.',
      evidence: [{ source: 'ElevaBusinessIntelligenceService', detail: 'No external evidence was supplied for this decision.', classification: EvidenceLabel.UNVERIFIED }],
      options: input.options,
      recommendedOption: input.recommendedOption ?? input.options[0].name,
      rationale: input.rationale ?? 'No external rationale was supplied.',
      risks: [{ classification: 'LOW', area: 'decision-support', triggerOrEvidence: 'advisory only', mitigation: 'requires user approval before execution' }],
      operationalImpact: 'None observed unless the user approves consequential action.',
      technicalImpact: 'Advisory output only; no system changes without M6 execution.',
      createdAt: new Date(),
    };

    this.decisions.set(request.requestId, request);
    await this.rememberBusinessMemory(request.requestId, { type: 'decision', question: input.question, recommendation: request.recommendedOption });
    this.emitAudit('AGENT.M8.DECISION_SUPPORT_CREATED', 'ElevaDecisionSupport', request.requestId, { question: input.question, recommendedOption: request.recommendedOption });
    return request;
  }

  async buildOperationalPlan(input: { insightId?: string; recommendationId?: string; situationId?: string; objective: string; affectedComponents: string[]; tasks: OperationalPlan['tasks']; dependencies: string[]; verificationRequirements: string[]; abortOrRollbackCriteria: string[] }): Promise<OperationalPlan> {
    const planId = this.generateId('plan');
    const m6ApprovalRequired = this.requiresM6Approval(input.tasks);
    const m6ActionId = m6ApprovalRequired ? this.generateId('m6-action') : undefined;

    const plan: OperationalPlan = {
      planId,
      insightId: input.insightId,
      recommendationId: input.recommendationId,
      situationId: input.situationId,
      objective: input.objective,
      affectedComponents: input.affectedComponents,
      tasks: input.tasks,
      dependencies: input.dependencies,
      verificationRequirements: input.verificationRequirements,
      abortOrRollbackCriteria: input.abortOrRollbackCriteria,
      m6ApprovalRequired,
      m6ActionId,
      approvalStatus: m6ApprovalRequired ? 'pending' : 'approved',
      createdAt: new Date(),
    };

    this.plans.set(planId, plan);

    if (m6ApprovalRequired && this.agentService && m6ActionId) {
      this.agentService.recordApproval(m6ActionId, 'PROJECT_MANAGEMENT');
    }

    await this.rememberBusinessMemory(planId, { type: 'plan', objective: input.objective, approvalRequired: m6ApprovalRequired });
    this.emitAudit('AGENT.M8.PLAN_CREATED', 'ElevaOperationalPlan', planId, { m6ApprovalRequired, m6ActionId: m6ActionId ?? null, objective: input.objective });
    return plan;
  }

  async approveM6Plan(planId: string, actionId: string): Promise<OperationalPlan> {
    const plan = this.requirePlan(planId);
    if (!plan.m6ApprovalRequired) {
      throw new Error(`Plan [${planId}] does not require M6 approval.`);
    }
    if (plan.m6ActionId !== actionId) {
      throw new Error(`Action ID [${actionId}] does not match plan [${planId}].`);
    }
    plan.approvalStatus = 'approved';
    this.plans.set(planId, plan);
    this.emitAudit('AGENT.M8.PLAN_APPROVED', 'ElevaOperationalPlan', planId, { actionId });
    return plan;
  }

  async executeM6Plan(planId: string, actionId: string, verifier?: (plan: OperationalPlan) => Promise<boolean>): Promise<{ plan: OperationalPlan; executed: boolean }> {
    const plan = this.requirePlan(planId);
    if (!plan.m6ApprovalRequired) {
      throw new Error(`Plan [${planId}] does not require M6 approval.`);
    }
    if (plan.m6ActionId !== actionId) {
      throw new Error(`Action ID [${actionId}] does not match plan [${planId}].`);
    }
    if (plan.approvalStatus !== 'approved') {
      throw new Error(`Plan [${planId}] is not approved for M6 execution.`);
    }
    this.agentService?.assertApproved(actionId);

    plan.approvalStatus = 'executed';
    this.plans.set(planId, plan);
    await this.rememberBusinessMemory(`${planId}:execution`, { type: 'plan-execution', planId, status: 'executed' });

    let verified = false;
    if (verifier) {
      try {
        verified = await verifier(plan);
      } catch (error) {
        this.logger.error(`M6 plan verification failed for ${planId}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    if (!verified) {
      plan.approvalStatus = 'failed';
      this.plans.set(planId, plan);
      this.agentService?.assertActionVerified(false, actionId);
      this.emitAudit('AGENT.M8.PLAN_VERIFICATION_FAILED', 'ElevaOperationalPlan', planId, { actionId });
      return { plan, executed: false };
    }

    plan.approvalStatus = 'verified';
    this.plans.set(planId, plan);
    this.agentService?.markExecuted(actionId);
    this.agentService?.assertActionVerified(true, actionId);
    await this.rememberBusinessMemory(`${planId}:verification`, { type: 'plan-verification', planId, status: 'verified' });
    this.emitAudit('AGENT.M8.PLAN_VERIFIED', 'ElevaOperationalPlan', planId, { actionId });
    return { plan, executed: true };
  }

  async getBusinessIntelligenceContext(): Promise<BusinessIntelligenceContext> {
    const [metrics, situations] = await Promise.all([
      this.computeMetrics(),
      this.intelligenceService?.listSituations() ?? Promise.resolve([]),
    ]);

    const plans = Array.from(this.plans.values()).map((plan) => ({ ...plan, tasks: plan.tasks.map((task) => ({ ...task })) }));
    const pendingApprovals = plans.filter((plan) => plan.approvalStatus === 'pending' && plan.m6ActionId).map((plan) => ({ actionId: plan.m6ActionId!, planId: plan.planId, objective: plan.objective }));

    return {
      metrics,
      insights: Array.from(this.insights.values()),
      decisions: Array.from(this.decisions.values()),
      plans,
      pendingApprovals,
      m7Situations: situations.map((situation) => ({ situationId: situation.id, state: situation.state, severity: situation.severity, recommendationCount: situation.recommendations.length })),
      generatedAt: new Date(),
    };
  }

  async consumeM7SituationsIntoInsights(): Promise<ExecutiveInsight[]> {
    if (!this.intelligenceService) {
      return [];
    }

    const situations = this.intelligenceService.listSituations();
    const insights: ExecutiveInsight[] = [];
    for (const situation of situations) {
      if (situation.recommendations.length === 0) {
        continue;
      }

      const recommendation = situation.recommendations[0];
      const insight: ExecutiveInsight = {
        insightId: this.generateId('insight'),
        m7SituationId: situation.id,
        dataSource: 'eleva.intelligence.situations',
        observation: `${situation.state} situation with severity ${situation.severity}: ${recommendation.summary}`,
        timeRange: { from: situation.detectedAt, to: situation.lastUpdatedAt },
        evidence: situation.evidence.map((evidence) => ({ source: 'situation.evidence', detail: JSON.stringify(evidence), classification: EvidenceLabel.VERIFIED })),
        analysis: `M7 situation ${situation.id} produced a ${recommendation.approvalRequired ? 'sensitive' : 'low-risk'} recommendation.`,
        impact: recommendation.risk.area,
        confidence: situation.severity === 'LOW' ? 'medium' : 'high',
        classification: 'inference',
        limitations: ['Insight is derived from M7 situation correlation and may not include all operational context.'],
        recommendation: recommendation.proposedAction,
        createdAt: new Date(),
      };

      this.insights.set(insight.insightId, insight);
      insights.push(insight);
    }

    if (insights.length) {
      this.emitAudit('AGENT.M8.M7_CONSUMED', 'ElevaExecutiveInsight', undefined, { insightCount: insights.length });
    }

    return insights;
  }

  private async rememberBusinessMemory(key: string, payload: Record<string, unknown>, tenantId?: string | null): Promise<void> {
    if (!this.memoryService) {
      return;
    }

    const provenance = {
      evidenceClassification: MemoryEvidenceClassification.RECOMMENDATION,
      source: 'eleva-business-intelligence',
      retrievedAt: new Date(),
      confidence: 'medium' as const,
      limitations: ['Memory is advisory context only and does not change execution behavior.'],
    };

    try {
      this.memoryService.remember({
        category: MemoryCategory.DECISION,
        key,
        value: JSON.stringify(payload),
        provenance,
        tags: ['m8', tenantId ?? 'platform'],
      });
    } catch (error) {
      this.logger.warn(`Failed to persist M8 memory [${key}]: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private buildDefaultObservation(availableMetrics: MetricResult[], unavailableMetrics: MetricResult[]): string {
    if (!availableMetrics.length && unavailableMetrics.length) {
      return 'Requested metrics are currently unavailable. No values were fabricated.';
    }
    if (!availableMetrics.length) {
      return 'No metrics were computed for the requested scope.';
    }
    return `M8 computed ${availableMetrics.length} available metric(s)${unavailableMetrics.length ? ` and ${unavailableMetrics.length} unavailable metric(s)` : ''} without fabricating values.`;
  }

  private buildAnalysis(availableMetrics: MetricResult[], unavailableMetrics: MetricResult[]): string {
    const available = availableMetrics.map((metric) => `${metric.metricId}=${typeof metric.value === 'number' ? metric.value : JSON.stringify(metric.value)}`).join(', ');
    const unavailable = unavailableMetrics.map((metric) => `${metric.metricId}=UNAVAILABLE`).join(', ');
    const parts = ['This insight is bounded to verified available metrics.'];
    if (available) {
      parts.push(`Available metrics: ${available}.`);
    }
    if (unavailable) {
      parts.push(`Unavailable metrics: ${unavailable}.`);
    }
    return parts.join(' ');
  }

  private buildRecommendation(availableMetrics: MetricResult[]): string | undefined {
    if (!availableMetrics.length) {
      return 'No recommendation can be formed without available metrics.';
    }
    return 'Review the available metrics above and confirm whether an M6-approved operational plan is required.';
  }

  private requiresM6Approval(tasks: OperationalPlan['tasks']): boolean {
    const sensitiveKeywords = ['deploy', 'database', 'migration', 'payment', 'billing', 'security', 'production'];
    return tasks.some((task) => sensitiveKeywords.some((keyword) => `${task.name} ${task.description}`.toLowerCase().includes(keyword)));
  }

  private requirePlan(planId: string): OperationalPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Operational plan [${planId}] was not found.`);
    }
    return plan;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
        userAgent: 'eleva-business-intelligence',
      })
      .catch((error: unknown) => this.logger.error(`Failed to emit M8 business intelligence audit log: ${error instanceof Error ? error.message : 'unknown'}`));
  }
}
