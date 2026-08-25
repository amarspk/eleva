import { Test, TestingModule } from '@nestjs/testing';
import { AgentOrchestrator } from './agent-orchestrator';
import { AgentService } from './agent.service';
import { AGENT_LLM_PROVIDER, type AgentLlmProvider } from './llm/agent-llm.types';
import { HeuristicLlmProvider } from './llm/heuristic-llm.provider';
import { AuditService } from '../audit/audit.service';

const store: {
  session: Record<string, unknown> | null;
  actions: Array<Record<string, unknown>>;
  messages: unknown[];
} = { session: null, actions: [], messages: [] };

jest.mock('@zayjar/db', () => ({
  prisma: {},
  TenantProductRepository: class { async findById(): Promise<null> { return null; } },
  TenantCategoryRepository: class { async findById(): Promise<null> { return null; } },
  TenantCustomerRepository: class { async findById(): Promise<null> { return null; } },
  TenantRestaurantRepository: class { async findById(): Promise<null> { return null; } },
  TenantOrderRepository: class { async findById(): Promise<null> { return null; } },
  TenantBranchRepository: class { async findById(): Promise<null> { return null; } },
  TenantUserRepository: class { async findById(): Promise<null> { return null; } },
  TenantTableRepository: class { async findById(): Promise<null> { return null; } },
  TenantDiscountRepository: class { async findById(): Promise<null> { return null; } },
  TenantInvoiceRepository: class { async findById(): Promise<null> { return null; } },
}));

jest.mock('./agent-db', () => ({
  agentDb: () => ({
    agentSession: {
      findUnique: async () => (store.session
        ? { ...store.session, messages: store.messages, actions: store.actions }
        : null),
    },
    agentMessage: {
      create: async ({ data }: { data: unknown }) => {
        store.messages.push(data);
        return data;
      },
    },
    agentAction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `act-${store.actions.length}`, ...data };
        store.actions.push(row);
        return row;
      },
    },
    agentProjectMemory: {
      findMany: async () => [],
    },
  }),
}));

describe('AgentOrchestrator — Slice 3', () => {
  const ownerId = 'b0000001-0000-4000-b000-000000000002';
  const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let orchestrator: AgentOrchestrator;
  const audit = { log: jest.fn().mockResolvedValue(null) };

  beforeEach(async () => {
    store.session = { id: sessionId, userId: ownerId, status: 'OPEN' };
    store.actions = [];
    store.messages = [];
    audit.log.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        AgentOrchestrator,
        { provide: AuditService, useValue: audit },
        { provide: AGENT_LLM_PROVIDER, useClass: HeuristicLlmProvider },
      ],
    }).compile();
    orchestrator = module.get(AgentOrchestrator);
  });

  it('clarifies Arabic product requests and does not propose or execute', async () => {
    const result = await orchestrator.chat(sessionId, ownerId, 'أريد أضيف منتج جديد');
    expect(result.intent).toBe('clarify');
    expect(result.proposed).toBe(false);
    expect(result.executed).toBe(false);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.projectStateUsed).toBe(true);
    expect(result.provider).toBe('heuristic');
    expect(result.ollamaStatus).toBe('HEURISTIC_FALLBACK');
    expect(store.actions.filter((row) => row.status === 'EXECUTED')).toHaveLength(0);
  });

  it('uses PROJECT_STATE for mixed-language order inspection and never touches tenant orders', async () => {
    const result = await orchestrator.chat(sessionId, ownerId, 'ELEVA افحص مشكلة الطلبات');
    expect(result.executedSafeTools).toContain('read_project_state');
    expect(result.reply).not.toMatch(/ORD-20/);
    expect(store.actions.every((row) => ['read_project_state', 'git_status', 'git_log', 'read_repo_file', 'read_project_spec'].includes(String(row.tool)))).toBe(true);
  });

  it('records a PROPOSED plan for product-system development without applying patches', async () => {
    const result = await orchestrator.chat(sessionId, ownerId, 'طور نظام المنتجات');
    expect(result.proposed).toBe(true);
    expect(result.executed).toBe(false);
    expect(store.actions.some((row) => row.tool === 'propose_plan' && row.status === 'PROPOSED')).toBe(true);
    expect(store.actions.some((row) => row.tool === 'apply_patch')).toBe(false);
  });

  it('loads approved specifications as SAFE inspect and does not invent tenant facts', async () => {
    const result = await orchestrator.chat(sessionId, ownerId, 'Read DOC-001 specification');
    expect(result.executedSafeTools).toEqual(expect.arrayContaining(['read_project_state', 'read_project_spec']));
    expect(result.executed).toBe(false);
    expect(result.reply).not.toMatch(/ORD-20/);
    expect(store.actions.some((row) => row.tool === 'read_project_spec' && row.status === 'EXECUTED')).toBe(true);
    expect(store.actions.some((row) => row.tool === 'apply_patch')).toBe(false);
  });

  it('ignores LLM-requested sensitive tools (registry bypass)', async () => {
    const rogue: AgentLlmProvider = {
      name: 'rogue',
      complete: async () => ({
        language: 'en',
        intent: 'inspect',
        reply: 'I will patch production.',
        questions: [],
        safeTools: [{ tool: 'apply_patch', args: { path: 'apps/api/src/main.ts' } }],
        propose: false,
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        AgentOrchestrator,
        { provide: AuditService, useValue: audit },
        { provide: AGENT_LLM_PROVIDER, useValue: rogue },
      ],
    }).compile();
    const isolated = module.get(AgentOrchestrator);
    const result = await isolated.chat(sessionId, ownerId, 'apply a patch');
    expect(result.executedSafeTools).toEqual([]);
    expect(store.actions.some((row) => row.tool === 'apply_patch' && row.status === 'EXECUTED')).toBe(false);
  });
});
