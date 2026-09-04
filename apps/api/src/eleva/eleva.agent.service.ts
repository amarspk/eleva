import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  AgentTaskResult,
  AgentTaskStatus,
  AgentTaskOutcome,
  AgentTaskRequest,
  AgentToolRisk,
} from './agent.task';
import { ElevaService } from './eleva.service';
import { ElevaAdvisoryService } from './eleva.advisory';
import { ElevaResearchService } from './eleva.research';
import { ElevaMemoryService } from './eleva.memory';
import { MemoryCategory, MemoryEvidenceClassification } from './eleva.state';
import { ElevaIntelligenceService } from './eleva.intelligence';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { ElevaOperationalService } from './eleva.operations';
import { AgentExecutionService } from './agent.execution';
import { AuthenticatedRequest } from '../common/types/request.types';

export interface AgentObjective {
  objective: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentPlanResult {
  objective: string | null;
  plan: string[];
  blockers: string[];
  recommendation: string | null;
  decisionId?: string;
  m6ApprovalRequired: boolean;
}

export type AgentPlanResponse = Record<string, unknown> | AgentPlanResult;

export interface AgentExecutionRecord {
  taskId: string;
  action: string;
  status: AgentTaskStatus;
  outcome: AgentTaskOutcome;
  executedAt?: Date;
  verifiedAt?: Date;
  result?: Record<string, unknown>;
  verification?: { passed: boolean; details?: Record<string, unknown> };
  error?: string;
}

export interface ExecutiveOfficeAgentState {
  currentState: Record<string, unknown>;
  objective: AgentObjective | null;
  activeTask: AgentExecutionRecord | null;
  plan: string[];
  situations: Record<string, unknown>[];
  insights: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  executions: AgentExecutionRecord[];
  verificationOutcomes: AgentExecutionRecord['verification'][];
  blockers: string[];
  nextAction: string | null;
  memory: Record<string, unknown>[];
  operational: Record<string, unknown> | null;
  failures: AgentExecutionRecord[];
}

const OBJECTIVE_MEMORY_KEY = 'eleva-agent:current-objective';
const EXECUTION_HISTORY_MEMORY_KEY = 'eleva-agent:execution-history';
const PLAN_MEMORY_KEY = 'eleva-agent:plan';
const BLOCKER_MEMORY_KEY = 'eleva-agent:blockers';

@Injectable()
export class ElevaAgentService {
  private readonly logger = new Logger(ElevaAgentService.name);
  private objective: AgentObjective | null = null;
  private readonly executions = new Map<string, AgentExecutionRecord>();
  private readonly executionOrder: string[] = [];
  private plan: string[] = [];
  private blockers: string[] = [];
  private readonly pendingApprovalActionIds = new Set<string>();
  private readonly decisionReasons = new Map<string, string>();

  constructor(
    private readonly elevaService: ElevaService,
    private readonly advisoryService: ElevaAdvisoryService,
    private readonly researchService: ElevaResearchService,
    private readonly memoryService: ElevaMemoryService,
    private readonly intelligenceService?: ElevaIntelligenceService,
    private readonly businessIntelligenceService?: ElevaBusinessIntelligenceService,
    private readonly operationalService?: ElevaOperationalService,
    private readonly agentExecutionService?: AgentExecutionService,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.loadPersistedState();
  }

  async setObjective(objective: string): Promise<AgentObjective> {
    this.objective = {
      objective: objective.trim(),
      createdAt: this.objective?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    await this.memoryService.remember({
      category: MemoryCategory.PROJECT_GOAL,
      key: OBJECTIVE_MEMORY_KEY,
      value: this.objective.objective,
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.VERIFIED,
        source: 'eleva-agent',
        retrievedAt: new Date(),
      },
      tags: ['m9', 'objective'],
    });
    this.emitAudit('AGENT.M9.SET_OBJECTIVE', 'ElevaAgentObjective', OBJECTIVE_MEMORY_KEY, {
      objective: this.objective.objective,
    });
    return { ...this.objective };
  }

  async loadProjectState(): Promise<Record<string, unknown>> {
    const memorySnapshot = this.memoryService.recall();
    const objectiveEntry = memorySnapshot.find((entry) => entry.key === OBJECTIVE_MEMORY_KEY);
    if (objectiveEntry && !this.objective) {
      this.objective = {
        objective: objectiveEntry.value,
        createdAt: objectiveEntry.createdAt,
        updatedAt: objectiveEntry.updatedAt,
      };
    }

    const executionHistoryEntry = memorySnapshot.find((entry) => entry.key === EXECUTION_HISTORY_MEMORY_KEY);
    if (executionHistoryEntry) {
      try {
        const history = JSON.parse(executionHistoryEntry.value) as AgentExecutionRecord[];
        this.executions.clear();
        this.executionOrder.length = 0;
        for (const record of history) {
          this.executions.set(record.taskId, record);
          this.executionOrder.push(record.taskId);
        }
      } catch {
        this.logger.warn('Failed to parse persisted execution history.');
      }
    }

    const planEntry = memorySnapshot.find((entry) => entry.key === PLAN_MEMORY_KEY);
    if (planEntry) {
      try {
        this.plan = JSON.parse(planEntry.value);
      } catch {
        this.plan = [];
      }
    }

    const blockerEntry = memorySnapshot.find((entry) => entry.key === BLOCKER_MEMORY_KEY);
    if (blockerEntry) {
      try {
        this.blockers = JSON.parse(blockerEntry.value);
      } catch {
        this.blockers = [];
      }
    }

    this.emitAudit('AGENT.M9.LOAD_PROJECT_STATE', 'ElevaAgentState', 'project-state', {
      objective: this.objective?.objective ?? null,
      executionCount: this.executions.size,
      planLength: this.plan.length,
      blockers: this.blockers.length,
    });
    return this.buildStatePayload();
  }

  async continueFromLastState(options: { objective?: string } = {}): Promise<ExecutiveOfficeAgentState> {
    const _state = await this.loadProjectState();
    if (options.objective) {
      await this.setObjective(options.objective);
    }

    const nextAction = this.determineNextAction();
    this.plan = nextAction.planItems;
    await this.persistPlan();
    this.blockers = nextAction.blockers;
    await this.persistBlockers();

    this.emitAudit('AGENT.M9.CONTINUE', 'ElevaAgentState', 'continue', {
      objective: this.objective?.objective ?? null,
      nextAction,
    });
    return this.getExecutiveOfficeAgentState();
  }

  async planNextTask(objective?: string): Promise<AgentPlanResult> {
    const activeObjective = objective ?? this.objective?.objective;
    if (!activeObjective) {
      return {
        objective: null,
        plan: [],
        blockers: ['No objective is set. Call setObjective or supply an objective before planning.'],
        recommendation: null,
        m6ApprovalRequired: false,
      };
    }

    const _research = await this.researchService.executeResearch(activeObjective, []);
    const advisory = await this.advisoryService.advise(activeObjective, {
      repositoryFacts: { objective: activeObjective },
    });
    const planItems = advisory.map((finding) => finding.finding).filter(Boolean);
    this.plan = planItems.length ? planItems : ['Analyze objective: ' + activeObjective];
    await this.persistPlan();

    const recommendation = advisory.find((finding) => Boolean(finding.recommendation));
    let decisionId: string | undefined;
    if (recommendation) {
      const decision = this.recordDecision({
        summary: recommendation.recommendation ?? '',
        rationale: recommendation.finding,
        approvalStatus: recommendation.approvalRequired ? 'pending' : 'approved',
        initiatedBy: 'eleva-agent',
      }) as { id: string };
      decisionId = decision.id;
    }

    this.emitAudit('AGENT.M9.PLAN_CREATED', 'ElevaPlan', PLAN_MEMORY_KEY, {
      objective: activeObjective,
      planLength: this.plan.length,
      decisionId,
    });
    return {
      objective: activeObjective,
      plan: this.plan,
      blockers: this.blockers,
      recommendation: recommendation ? recommendation.recommendation ?? null : null,
      decisionId,
      m6ApprovalRequired: recommendation?.approvalRequired ?? false,
    };
  }

  async runTask(
    request: AgentTaskRequest,
    user: AuthenticatedRequest['user'],
    options: { repositoryContext?: Record<string, unknown> } = {},
  ): Promise<AgentTaskResult> {
    const taskId = this.generateTaskId();

    if (!user) {
      const result = this.createRejectedResult(taskId, request, 'Authenticated user is required before executing an ELEVA task.');
      this.recordExecution(taskId, result);
      this.emitAudit('AGENT.M9.RUN_TASK', 'ElevaTask', taskId, { ...result });
      return result;
    }

    const approval = request.approvalActionId ? this.elevaService.getApproval(request.approvalActionId) : undefined;
    if (request.toolName && !approval?.approved && this.isApprovalRequired(request.toolName, request.risk)) {
      const result = this.createApprovalRequiredResult(taskId, request);
      this.pendingApprovalActionIds.add('pending:' + (request.toolName || '') + ':' + taskId);
      this.recordExecution(taskId, result);
      this.emitAudit('AGENT.M9.RUN_TASK', 'ElevaTask', taskId, { ...result });
      return result;
    }

    const advisory = await this.advisoryService.advise(request.action, {
      repositoryFacts: options.repositoryContext,
    });
    const requiresApproval = advisory.some((finding) => finding.approvalRequired);
    if (requiresApproval && !approval?.approved) {
      const result = this.createApprovalRequiredResult(taskId, request);
      this.pendingApprovalActionIds.add('pending:' + (request.toolName || request.action) + ':' + taskId);
      this.recordExecution(taskId, result);
      this.emitAudit('AGENT.M9.RUN_TASK', 'ElevaTask', taskId, { ...result });
      return result;
    }

    if (!this.agentExecutionService) {
      const result = this.createToolFailureResult(taskId, request, 'AgentExecutionService is not available.');
      this.recordExecution(taskId, result);
      this.emitAudit('AGENT.M9.RUN_TASK', 'ElevaTask', taskId, { ...result });
      return result;
    }

    const executionResult = await this.agentExecutionService.executeTask(request, { user } as AuthenticatedRequest);
    const record: AgentExecutionRecord = {
      taskId,
      action: request.action,
      status: executionResult.status,
      outcome: executionResult.outcome,
      executedAt: executionResult.executedAt,
      verifiedAt: executionResult.verification?.passed ? new Date() : undefined,
      result: executionResult.result,
      verification: executionResult.verification,
      error: executionResult.toolError ?? executionResult.verificationError ?? executionResult.authorizationError,
    };
    this.recordExecution(taskId, record);

    if (executionResult.outcome === AgentTaskOutcome.EXECUTED) {
      await this.persistBusinessMemory(taskId + ':executed', {
        type: 'task-executed',
        taskId,
        action: request.action,
        toolName: request.toolName,
        outcome: executionResult.outcome,
      });
    }

    if (executionResult.outcome === AgentTaskOutcome.VERIFICATION_FAILURE) {
      this.blockers.push('Verification failure for task ' + taskId + ': ' + record.error);
      await this.persistBlockers();
    }

    if (executionResult.outcome === AgentTaskOutcome.APPROVAL_REQUIRED) {
      this.pendingApprovalActionIds.add('pending:' + (request.toolName || request.action) + ':' + taskId);
    } else if (approval?.approved && request.approvalActionId) {
      this.pendingApprovalActionIds.delete('pending:' + (request.toolName || request.action) + ':' + taskId);
    }

    this.emitAudit('AGENT.M9.RUN_TASK', 'ElevaTask', taskId, {
      taskId,
      status: executionResult.status,
      outcome: executionResult.outcome,
      approvalRequired: executionResult.approvalRequired,
      approvalGranted: executionResult.approvalGranted,
    });
    return executionResult;
  }

  getExecutiveOfficeAgentState(): ExecutiveOfficeAgentState {
    const situations = this.intelligenceService?.listSituations() ?? [];
    const insights = this.businessIntelligenceService?.listMetricDefinitions().map((metric) => ({ ...metric })) ?? [];
    const memorySnapshot = this.memoryService.recall();

    return {
      currentState: { ...this.elevaService.getStatus() },
      objective: this.objective ? { ...this.objective } : null,
      activeTask: this.executionOrder.length ? (this.executions.get(this.executionOrder[this.executionOrder.length - 1]) ?? null) : null,
      plan: [...this.plan],
      situations: situations.map((situation) => ({ ...situation, evidence: [...situation.evidence] })),
      insights,
      recommendations: Array.from(this.decisionReasons.entries()).map(([id, reason]) => ({ id, reason })),
      approvals: Array.from(this.pendingApprovalActionIds).map((id) => ({ actionId: id })),
      executions: this.executionOrder.map((id) => this.executions.get(id)!).filter(Boolean),
      verificationOutcomes: this.executionOrder
        .map((id) => this.executions.get(id)!)
        .filter((record) => record.verification)
        .map((record) => record.verification!),
      blockers: [...this.blockers],
      nextAction: this.plan[0] ?? null,
      memory: memorySnapshot.map((entry) => ({ ...entry, provenance: { ...entry.provenance } })),
      operational: this.operationalService ? {} : null,
      failures: this.executionOrder
        .map((id) => this.executions.get(id)!)
        .filter((record) => record.outcome === AgentTaskOutcome.VERIFICATION_FAILURE || record.outcome === AgentTaskOutcome.TOOL_FAILURE),
    };
  }

  recordDecision(decision: { summary: string; rationale: string; approvalStatus: string; initiatedBy: string }): Record<string, unknown> {
    const id = 'decision-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    this.decisionReasons.set(id, decision.rationale);
    this.memoryService.remember({
      category: MemoryCategory.DECISION,
      key: id,
      value: decision.summary,
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.RECOMMENDATION,
        source: 'eleva-agent',
        retrievedAt: new Date(),
      },
      tags: ['m9', 'decision'],
    });
    this.emitAudit('AGENT.M9.DECISION', 'ElevaDecision', id, decision);
    return { id, ...decision };
  }

  async rememberOutcome(taskId: string, outcome: Record<string, unknown>): Promise<void> {
    await this.memoryService.remember({
      category: MemoryCategory.DECISION,
      key: 'eleva-agent:outcome:' + taskId,
      value: JSON.stringify(outcome),
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.VERIFIED,
        source: 'eleva-agent',
        retrievedAt: new Date(),
      },
      tags: ['m9', 'outcome'],
    });
    this.emitAudit('AGENT.M9.OUTCOME', 'ElevaOutcome', taskId, outcome);
  }

  private recordExecution(taskId: string, result: AgentTaskResult | AgentExecutionRecord): void {
    const record: AgentExecutionRecord = {
      taskId,
      action: result.action,
      status: result.status,
      outcome: result.outcome,
      executedAt: (result as AgentTaskResult).executedAt,
      verifiedAt: result.verification?.passed ? new Date() : undefined,
      result: result.result,
      verification: result.verification,
      error: (result as AgentTaskResult).toolError ?? (result as AgentTaskResult).verificationError,
    };
    this.executions.set(taskId, record);
    this.executionOrder.push(taskId);
  }

  private determineNextAction(): { planItems: string[]; blockers: string[] } {
    const planItems: string[] = [];
    const blockers: string[] = [...this.blockers];

    if (!this.objective) {
      blockers.push('No active objective is set. The agent cannot continue without an objective.');
      return { planItems: [], blockers };
    }

    const activeBlockers = blockers.filter((blocker) => !blocker.startsWith('No active objective'));
    if (activeBlockers.length > 0) {
      return {
        planItems: ['Resolve blocker: ' + activeBlockers[0]],
        blockers: activeBlockers,
      };
    }

    const failed = this.executionOrder
      .map((id) => this.executions.get(id)!)
      .filter((record) => record.outcome === AgentTaskOutcome.VERIFICATION_FAILURE || record.outcome === AgentTaskOutcome.TOOL_FAILURE);
    if (failed.length > 0) {
      planItems.push('Investigate failure evidence for task ' + failed[0].taskId + '.');
      planItems.push('Retry or route through approval only when bounded and justified.');
      return { planItems: planItems.length ? planItems : ['Continue objective: ' + this.objective.objective], blockers };
    }

    planItems.push('Continue objective: ' + this.objective.objective);
    return { planItems, blockers };
  }

  private async persistPlan(): Promise<void> {
    await this.memoryService.remember({
      category: MemoryCategory.PROJECT_GOAL,
      key: PLAN_MEMORY_KEY,
      value: JSON.stringify(this.plan),
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.VERIFIED,
        source: 'eleva-agent',
        retrievedAt: new Date(),
      },
      tags: ['m9', 'plan'],
    });
  }

  private async persistBlockers(): Promise<void> {
    await this.memoryService.remember({
      category: MemoryCategory.PROJECT_GOAL,
      key: BLOCKER_MEMORY_KEY,
      value: JSON.stringify(this.blockers),
      provenance: {
        evidenceClassification: MemoryEvidenceClassification.UNKNOWN,
        source: 'eleva-agent',
        retrievedAt: new Date(),
      },
      tags: ['m9', 'blocker'],
    });
  }

  private async persistBusinessMemory(key: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.memoryService) {
      return;
    }

    try {
      await this.memoryService.remember({
        category: MemoryCategory.DECISION,
        key,
        value: JSON.stringify(payload),
        provenance: {
          evidenceClassification: MemoryEvidenceClassification.RECOMMENDATION,
          source: 'eleva-agent',
          retrievedAt: new Date(),
        },
        tags: ['m9', 'execution'],
      });
    } catch (error) {
      this.logger.warn('Failed to persist M9 memory [' + key + ']: ' + (error instanceof Error ? error.message : 'unknown'));
    }
  }

  private async loadPersistedState(): Promise<void> {
    try {
      await this.loadProjectState();
    } catch {
      this.logger.warn('Initial project state load failed; continuing with in-memory defaults.');
    }
  }

  private createRejectedResult(taskId: string, request: AgentTaskRequest, error: string): AgentTaskResult {
    return {
      taskId,
      status: AgentTaskStatus.REJECTED,
      outcome: AgentTaskOutcome.UNAUTHORIZED,
      action: request.action,
      toolName: request.toolName,
      authorizationError: error,
    };
  }

  private createApprovalRequiredResult(taskId: string, request: AgentTaskRequest): AgentTaskResult {
    return {
      taskId,
      status: AgentTaskStatus.APPROVAL_REQUIRED,
      outcome: AgentTaskOutcome.APPROVAL_REQUIRED,
      action: request.action,
      toolName: request.toolName,
      risk: request.risk,
      approvalRequired: true,
      approvalGranted: false,
    };
  }

  private createToolFailureResult(taskId: string, request: AgentTaskRequest, error: string): AgentTaskResult {
    return {
      taskId,
      status: AgentTaskStatus.FAILED,
      outcome: AgentTaskOutcome.TOOL_FAILURE,
      action: request.action,
      toolName: request.toolName,
      toolError: error,
    };
  }

  private isApprovalRequired(toolName?: string, risk?: AgentToolRisk): boolean {
    if (risk === 'HIGH' || risk === 'SENSITIVE') {
      return true;
    }
    if (toolName && /deploy|database|migration|payment|billing|security|production/i.test(toolName)) {
      return true;
    }
    return false;
  }

  private buildStatePayload(): Record<string, unknown> {
    return {
      objective: this.objective,
      executionCount: this.executions.size,
      plan: this.plan,
      blockers: this.blockers,
    };
  }

  private generateTaskId(): string {
    return 'eleva-task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
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
        userAgent: 'eleva-agent',
      })
      .catch((error: unknown) =>
        this.logger.error('Failed to emit ELEVA agent audit log: ' + (error instanceof Error ? error.message : 'unknown')),
      );
  }
}
