import { Test, TestingModule } from '@nestjs/testing';
import { ElevaAgentService } from './eleva.agent.service';
import { ElevaService } from './eleva.service';
import { ElevaAdvisoryService } from './eleva.advisory';
import { ElevaResearchService } from './eleva.research';
import { ElevaMemoryService } from './eleva.memory';
import { ElevaIntelligenceService } from './eleva.intelligence';
import { ElevaBusinessIntelligenceService } from './eleva.business.intelligence';
import { ElevaOperationalService } from './eleva.operations';
import { AgentExecutionService } from './agent.execution';
import { AuditService } from '../audit/audit.service';
import {
  AgentTaskResult,
  AgentTaskStatus,
  AgentTaskOutcome,
  AgentToolRisk,
} from './agent.task';
import { MemoryCategory, MemoryEvidenceClassification, EvidenceLabel, AnalysisFinding, MemoryEntry } from './eleva.state';
import { AuthenticatedRequest } from '../common/types/request.types';

const MOCK_USER: AuthenticatedRequest['user'] = {
  id: 'user-1',
  email: 'owner@albaik.localhost',
  tenantId: 'tenant-1',
  roles: ['RESTAURANT_OWNER'],
  permissions: ['read:agent'],
};

const buildAdvisory = (overrides: { recommendation?: string; approvalRequired?: boolean } = {}): AnalysisFinding[] => [
  {
    finding: 'Build the requested M9 orchestration surface.',
    evidence: [{ label: EvidenceLabel.VERIFIED, source: 'repo', detail: 'ELEVA_M9_DEFINITION_OF_DONE.md' }],
    recommendation: overrides.recommendation ?? 'Proceed with implementation.',
    approvalRequired: overrides.approvalRequired ?? false,
    risks: [],
    unknowns: [],
    alternatives: [],
    benefits: [],
    costsEffort: 'small',
    technicalImpact: 'none',
    operationalImpact: 'none',
    options: [],
    rationale: '',
    expectedImpact: '',
    proposedImplementation: '',
    decisionRequired: '',
  } as AnalysisFinding,
];

describe('ElevaAgentService M9 behavior', () => {
  let service: ElevaAgentService;
  let memoryService: jest.Mocked<ElevaMemoryService>;
  let advisoryService: jest.Mocked<ElevaAdvisoryService>;
  let researchService: jest.Mocked<ElevaResearchService>;
  let executionService: jest.Mocked<AgentExecutionService>;
  let auditLog: jest.Mock;

  const memoryEntry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'memory-1',
    category: MemoryCategory.PROJECT_GOAL,
    key: 'key',
    value: 'value',
    provenance: {
      evidenceClassification: MemoryEvidenceClassification.VERIFIED,
      source: 'test',
      retrievedAt: new Date(),
    },
    updatedAt: new Date(),
    createdAt: new Date(),
    tags: [],
    ...overrides,
  });

  beforeEach(async () => {
    auditLog = jest.fn().mockResolvedValue({ id: 'audit-1' });
    memoryService = {
      remember: jest.fn().mockImplementation((input) => ({
        id: 'memory-' + Math.random().toString(36).slice(2, 8),
        ...(input as Record<string, unknown>),
        updatedAt: new Date(),
        createdAt: new Date(),
        provenance: (input as any).provenance,
      } as Record<string, unknown>)),
      recall: jest.fn().mockReturnValue([]),
      findByCategoryAndKey: jest.fn().mockReturnValue(undefined),
      startConversation: jest.fn().mockReturnValue({
        conversationId: 'conversation-1',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        memoryKeys: [],
      }),
      appendMessage: jest.fn().mockReturnValue(undefined),
      getConversation: jest.fn().mockReturnValue(undefined),
      setSourceResolver: jest.fn(),
      respondToConversation: jest.fn().mockResolvedValue({ response: 'ok', evidence: [] }),
    } as unknown as jest.Mocked<ElevaMemoryService>;

    advisoryService = {
      advise: jest.fn().mockResolvedValue(buildAdvisory()),
      classifyIntent: jest.fn(),
      generateExplanation: jest.fn(),
      analyze: jest.fn(),
      compareOptions: jest.fn(),
      assessRisks: jest.fn(),
      createPlan: jest.fn(),
      buildExplanation: jest.fn(),
      buildPresentation: jest.fn(),
      buildVisualExplanation: jest.fn(),
      voiceBoundary: jest.fn(),
      buildM2CompatibleTask: jest.fn(),
      setSourceResolver: jest.fn(),
      recordDecision: jest.fn(),
      getDecision: jest.fn(),
    } as unknown as jest.Mocked<ElevaAdvisoryService>;

    researchService = {
      executeResearch: jest.fn().mockResolvedValue({ question: 'q', findings: [], verifiedFacts: [], inferences: [], assumptions: [], unknowns: [], limitations: [] }),
      setSourceResolver: jest.fn(),
    } as unknown as jest.Mocked<ElevaResearchService>;

    executionService = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<AgentExecutionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAgentService,
        {
          provide: ElevaService,
          useValue: {
            getStatus: jest.fn(() => ({ status: 'IDLE', activeCapability: null, persona: 'ELEVA', officeContext: 'Executive Office', updatedAt: new Date() })),
            getApproval: jest.fn(() => ({ actionId: '', approved: false })),
            recordApproval: jest.fn(),
            revokeApproval: jest.fn(),
            isApproved: jest.fn(() => false),
            markExecuted: jest.fn(),
            listPendingApprovals: jest.fn(() => []),
            recordDecision: jest.fn(),
          },
        },
        { provide: ElevaAdvisoryService, useValue: advisoryService },
        { provide: ElevaResearchService, useValue: researchService },
        { provide: ElevaMemoryService, useValue: memoryService },
        { provide: ElevaIntelligenceService, useValue: { listSituations: jest.fn().mockReturnValue([]) } },
        { provide: ElevaBusinessIntelligenceService, useValue: { listMetricDefinitions: jest.fn().mockReturnValue([]) } },
        { provide: ElevaOperationalService, useValue: { getHealth: jest.fn(), getDeployment: jest.fn(), getBackup: jest.fn(), getOperationalStatus: jest.fn() } },
        { provide: AgentExecutionService, useValue: executionService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    service = module.get<ElevaAgentService>(ElevaAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('orchestrates objective, planning, and execution end to end', async () => {
    executionService.executeTask.mockResolvedValue({
      taskId: 'task-1',
      status: AgentTaskStatus.EXECUTED,
      outcome: AgentTaskOutcome.EXECUTED,
      action: 'demo',
      toolName: 'agent.safe_demo_tool',
      result: { echoed: 'hello' },
      verification: { passed: true },
      executedAt: new Date(),
    } as AgentTaskResult);

    const objective = await service.setObjective('Implement M9');
    expect(objective.objective).toBe('Implement M9');

    const plan = await service.planNextTask('Implement M9');
    expect(plan.plan.length).toBeGreaterThan(0);
    expect(plan.objective).toBe('Implement M9');

    const run = await service.runTask(
      { action: 'demo', toolName: 'agent.safe_demo_tool', risk: AgentToolRisk.LOW, input: { message: 'hello' } },
      MOCK_USER,
    );
    expect(run.status).toBe('EXECUTED');
    expect(run.outcome).toBe('EXECUTED');
    expect(run.result).toEqual({ echoed: 'hello' });
  });

  it('recovers context/memory on construction and resume', async () => {
    memoryService.recall.mockReturnValue([
      memoryEntry({ key: 'eleva-agent:current-objective', value: 'Resume objective' }),
      memoryEntry({ key: 'eleva-agent:execution-history', value: JSON.stringify([{ taskId: 'task-old', status: 'EXECUTED', outcome: 'EXECUTED', action: 'old', result: {} }]) }),
      memoryEntry({ key: 'eleva-agent:plan', value: JSON.stringify(['Resume plan step']) }),
      memoryEntry({ key: 'eleva-agent:blockers', value: JSON.stringify([]) }),
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAgentService,
        {
          provide: ElevaService,
          useValue: {
            getStatus: jest.fn(() => ({ status: 'IDLE', activeCapability: null, persona: 'ELEVA', officeContext: 'Executive Office', updatedAt: new Date() })),
            getApproval: jest.fn(() => ({ actionId: '', approved: false })),
            recordApproval: jest.fn(),
            revokeApproval: jest.fn(),
            isApproved: jest.fn(() => false),
            markExecuted: jest.fn(),
            listPendingApprovals: jest.fn(() => []),
            recordDecision: jest.fn(),
          },
        },
        { provide: ElevaAdvisoryService, useValue: advisoryService },
        { provide: ElevaResearchService, useValue: researchService },
        { provide: ElevaMemoryService, useValue: memoryService },
        { provide: ElevaIntelligenceService, useValue: { listSituations: jest.fn().mockReturnValue([]) } },
        { provide: ElevaBusinessIntelligenceService, useValue: { listMetricDefinitions: jest.fn().mockReturnValue([]) } },
        { provide: ElevaOperationalService, useValue: { getHealth: jest.fn(), getDeployment: jest.fn(), getBackup: jest.fn(), getOperationalStatus: jest.fn() } },
        { provide: AgentExecutionService, useValue: executionService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    const recovered = module.get<ElevaAgentService>(ElevaAgentService);
    const state = await recovered.continueFromLastState();

    expect(state.objective?.objective).toBe('Resume objective');
    expect((state as any).plan).toEqual(['Continue objective: Resume objective']);
    expect((state as any).nextAction).toBe('Continue objective: Resume objective');
  });

  it('creates a plan from advisory output', async () => {
    advisoryService.advise.mockResolvedValue(buildAdvisory({ recommendation: 'Continue with M9.' }));

    const plan = await service.planNextTask('Continue with M9');

    expect(plan.objective).toBe('Continue with M9');
    expect(plan.plan.length).toBeGreaterThan(0);
    expect(plan.recommendation).toBe('Continue with M9.');
    expect(plan.decisionId).toBeDefined();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT.M9.PLAN_CREATED' }),
    );
  });

  it('permits execution for authorized low-risk tool execution', async () => {
    executionService.executeTask.mockResolvedValue({
      taskId: 'task-low',
      status: AgentTaskStatus.EXECUTED,
      outcome: AgentTaskOutcome.EXECUTED,
      action: 'demo',
      toolName: 'agent.safe_demo_tool',
      result: { echoed: 'ok' },
      verification: { passed: true },
      executedAt: new Date(),
    } as AgentTaskResult);

    const result = await service.runTask(
      { action: 'demo', toolName: 'agent.safe_demo_tool', risk: AgentToolRisk.LOW, input: { message: 'ok' } },
      MOCK_USER,
    );

    expect(result.status).toBe('EXECUTED');
    expect(result.outcome).toBe('EXECUTED');
    expect(memoryService.remember).toHaveBeenCalledWith(
      expect.objectContaining({ category: MemoryCategory.DECISION, tags: expect.arrayContaining(['m9', 'execution']) }),
    );
  });

  it('requires approval for sensitive/high-risk execution', async () => {
    const result = await service.runTask(
      { action: 'deploy', toolName: 'deploy.production', risk: AgentToolRisk.HIGH, input: {} },
      MOCK_USER,
    );

    expect(result.status).toBe('APPROVAL_REQUIRED');
    expect(result.outcome).toBe('APPROVAL_REQUIRED');
    expect(result.approvalRequired).toBe(true);
  });

  it('blocks execution when advisory requires approval and it is not granted', async () => {
    advisoryService.advise.mockResolvedValue(buildAdvisory({ approvalRequired: true }));

    const result = await service.runTask(
      { action: 'review', toolName: 'agent.review_tool', risk: AgentToolRisk.LOW, input: {} },
      MOCK_USER,
    );

    expect(result.status).toBe('APPROVAL_REQUIRED');
    expect(result.outcome).toBe('APPROVAL_REQUIRED');
  });

  it('records verified outcomes and audit trail after execution', async () => {
    executionService.executeTask.mockResolvedValue({
      taskId: 'task-audit',
      status: AgentTaskStatus.AUDITED,
      outcome: AgentTaskOutcome.AUDITED,
      action: 'demo',
      toolName: 'agent.safe_demo_tool',
      result: { echoed: 'audit' },
      verification: { passed: true },
      executedAt: new Date(),
      auditedAt: new Date(),
    } as AgentTaskResult);

    const result = await service.runTask(
      { action: 'demo', toolName: 'agent.safe_demo_tool', risk: AgentToolRisk.LOW, input: { message: 'audit' } },
      MOCK_USER,
    );

    expect(result.outcome).toBe('AUDITED');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT.M9.RUN_TASK', entityName: 'ElevaTask' }),
    );
  });

  it('handles tool failure and updates blockers/failures', async () => {
    executionService.executeTask.mockResolvedValue({
      taskId: 'task-fail',
      status: AgentTaskStatus.FAILED,
      outcome: AgentTaskOutcome.TOOL_FAILURE,
      action: 'demo',
      toolName: 'agent.failing_demo_tool',
      toolError: 'boom',
    } as AgentTaskResult);

    const result = await service.runTask(
      { action: 'demo', toolName: 'agent.failing_demo_tool', risk: AgentToolRisk.LOW, input: {} },
      MOCK_USER,
    );

    expect(result.status).toBe('FAILED');
    expect(result.outcome).toBe('TOOL_FAILURE');
    expect(result.toolError).toBe('boom');
  });

  it('resumes from interruption by restoring persisted state', async () => {
    memoryService.recall.mockReturnValue([
      memoryEntry({ key: 'eleva-agent:current-objective', value: 'Resume objective' }),
      memoryEntry({ key: 'eleva-agent:plan', value: JSON.stringify(['Resume plan step']) }),
      memoryEntry({ key: 'eleva-agent:blockers', value: JSON.stringify([]) }),
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAgentService,
        {
          provide: ElevaService,
          useValue: {
            getStatus: jest.fn(() => ({ status: 'IDLE', activeCapability: null, persona: 'ELEVA', officeContext: 'Executive Office', updatedAt: new Date() })),
            getApproval: jest.fn(() => ({ actionId: '', approved: false })),
            recordApproval: jest.fn(),
            revokeApproval: jest.fn(),
            isApproved: jest.fn(() => false),
            markExecuted: jest.fn(),
            listPendingApprovals: jest.fn(() => []),
            recordDecision: jest.fn(),
          },
        },
        { provide: ElevaAdvisoryService, useValue: advisoryService },
        { provide: ElevaResearchService, useValue: researchService },
        { provide: ElevaMemoryService, useValue: memoryService },
        { provide: ElevaIntelligenceService, useValue: { listSituations: jest.fn().mockReturnValue([]) } },
        { provide: ElevaBusinessIntelligenceService, useValue: { listMetricDefinitions: jest.fn().mockReturnValue([]) } },
        { provide: ElevaOperationalService, useValue: { getHealth: jest.fn(), getDeployment: jest.fn(), getBackup: jest.fn(), getOperationalStatus: jest.fn() } },
        { provide: AgentExecutionService, useValue: executionService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    const recovered = module.get<ElevaAgentService>(ElevaAgentService);
    const state = await recovered.continueFromLastState();

    expect(state.objective?.objective).toBe('Resume objective');
    expect((state as any).plan).toEqual(['Continue objective: Resume objective']);
    expect((state as any).nextAction).toBe('Continue objective: Resume objective');
  });

  it('surfaces M7 situations and M8 insights in Executive Office state', async () => {
    const situations = [{ situationId: 's1', state: 'open', evidence: [] }];
    const insights = [{ metricId: 'm1', name: 'Sales' }];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAgentService,
        {
          provide: ElevaService,
          useValue: {
            getStatus: jest.fn(() => ({ status: 'IDLE', activeCapability: null, persona: 'ELEVA', officeContext: 'Executive Office', updatedAt: new Date() })),
            getApproval: jest.fn(() => ({ actionId: '', approved: false })),
            recordApproval: jest.fn(),
            revokeApproval: jest.fn(),
            isApproved: jest.fn(() => false),
            markExecuted: jest.fn(),
            listPendingApprovals: jest.fn(() => []),
            recordDecision: jest.fn(),
          },
        },
        { provide: ElevaAdvisoryService, useValue: advisoryService },
        { provide: ElevaResearchService, useValue: researchService },
        { provide: ElevaMemoryService, useValue: memoryService },
        { provide: ElevaIntelligenceService, useValue: { listSituations: jest.fn(() => situations) } },
        { provide: ElevaBusinessIntelligenceService, useValue: { listMetricDefinitions: jest.fn(() => insights) } },
        { provide: ElevaOperationalService, useValue: { getHealth: jest.fn(), getDeployment: jest.fn(), getBackup: jest.fn(), getOperationalStatus: jest.fn() } },
        { provide: AgentExecutionService, useValue: executionService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    const agent = module.get<ElevaAgentService>(ElevaAgentService);
    const state = agent.getExecutiveOfficeAgentState();

    expect(state.situations).toEqual(situations);
    expect(state.insights).toEqual(insights);
  });

  it('persists verified outcomes to memory for later resume', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAgentService,
        {
          provide: ElevaService,
          useValue: {
            getStatus: jest.fn(() => ({ status: 'IDLE', activeCapability: null, persona: 'ELEVA', officeContext: 'Executive Office', updatedAt: new Date() })),
            getApproval: jest.fn(() => ({ actionId: '', approved: false })),
            recordApproval: jest.fn(),
            revokeApproval: jest.fn(),
            isApproved: jest.fn(() => false),
            markExecuted: jest.fn(),
            listPendingApprovals: jest.fn(() => []),
            recordDecision: jest.fn(),
          },
        },
        { provide: ElevaAdvisoryService, useValue: advisoryService },
        { provide: ElevaResearchService, useValue: researchService },
        { provide: ElevaMemoryService, useValue: memoryService },
        { provide: ElevaIntelligenceService, useValue: { listSituations: jest.fn().mockReturnValue([]) } },
        { provide: ElevaBusinessIntelligenceService, useValue: { listMetricDefinitions: jest.fn().mockReturnValue([]) } },
        { provide: ElevaOperationalService, useValue: { getHealth: jest.fn(), getDeployment: jest.fn(), getBackup: jest.fn(), getOperationalStatus: jest.fn() } },
        { provide: AgentExecutionService, useValue: executionService },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();

    const agent = module.get<ElevaAgentService>(ElevaAgentService);
    await agent.rememberOutcome('task-1', { taskId: 'task-1', outcome: 'EXECUTED' });

    expect(memoryService.remember).toHaveBeenCalledWith(
      expect.objectContaining({ category: MemoryCategory.DECISION, key: 'eleva-agent:outcome:task-1', tags: expect.arrayContaining(['m9', 'outcome']) }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGENT.M9.OUTCOME', entityName: 'ElevaOutcome' }),
    );
  });
});
