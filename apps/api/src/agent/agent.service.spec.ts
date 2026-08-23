import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AuditService } from '../audit/audit.service';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';

const store: {
  session: Record<string, unknown> | null;
  actions: unknown[];
  messages: unknown[];
} = {
  session: null,
  actions: [],
  messages: [],
};

jest.mock('@zayjar/db', () => {
  class Stub {
    async findById(): Promise<null> {
      return null;
    }
  }
  return {
    prisma: {},
    TenantProductRepository: Stub,
    TenantCategoryRepository: Stub,
    TenantCustomerRepository: Stub,
    TenantRestaurantRepository: Stub,
    TenantOrderRepository: Stub,
    TenantBranchRepository: Stub,
    TenantUserRepository: Stub,
    TenantTableRepository: Stub,
    TenantDiscountRepository: Stub,
    TenantInvoiceRepository: Stub,
  };
});

jest.mock('./agent-db', () => ({
  agentDb: () => ({
    agentSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.session = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...data };
        return store.session;
      },
      findMany: async () => (store.session ? [store.session] : []),
      findUnique: async () => store.session,
    },
    agentMessage: {
      create: async ({ data }: { data: unknown }) => {
        store.messages.push(data);
        return data;
      },
      findMany: async () => store.messages,
    },
    agentAction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...data };
        store.actions.push(row);
        return row;
      },
    },
  }),
}));

describe('AgentService — V1 Slice 1', () => {
  let service: AgentService;
  const audit = { log: jest.fn().mockResolvedValue(null) };

  beforeEach(async () => {
    store.session = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'b0000001-0000-4000-b000-000000000002',
      status: 'OPEN',
    };
    store.actions = [];
    store.messages = [];
    audit.log.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService, { provide: AuditService, useValue: audit }],
    }).compile();
    service = module.get(AgentService);
  });

  it('creates a platform-owned session and writes an audit row', async () => {
    const session = await service.createSession('b0000001-0000-4000-b000-000000000002', 'Inspect');
    expect(session).toMatchObject({ title: 'Inspect', status: 'OPEN' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: null,
      action: 'AGENT:session:create',
      entityName: 'AgentSession',
    }));
  });

  it('executes read_project_state as a SAFE EXECUTED action', async () => {
    const result = await service.invokeSafeTool(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'b0000001-0000-4000-b000-000000000002',
      'read_project_state',
      {},
    );
    expect(result.status).toBe('EXECUTED');
    expect(result.sensitivity).toBe('SAFE');
    expect(String((result.result as { content?: string }).content)).toContain('# PROJECT STATE');
    expect(store.actions[0]).toMatchObject({ tool: 'read_project_state', status: 'EXECUTED' });
  });

  it('does not execute a denied repo path (FAILED action, no secret content)', async () => {
    const result = await service.invokeSafeTool(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'b0000001-0000-4000-b000-000000000002',
      'read_repo_file',
      { path: '.env' },
    );
    expect(result.status).toBe('FAILED');
    expect(JSON.stringify(result.result)).toMatch(/Access denied/);
    expect(JSON.stringify(result.result)).not.toMatch(/SENDGRID_API_KEY\s*=/);
  });
});

describe('AgentController authorization', () => {
  it.each([
    ['createSession', 'create'],
    ['listSessions', 'read'],
    ['getSession', 'read'],
    ['invoke', 'create'],
  ] as const)('%s requires %s on Agent', (method, action) => {
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AgentController.prototype[method]);
    expect(meta).toEqual({ action, resource: 'Agent' });
  });

  it('403s restaurant staff even if the request is authenticated', async () => {
    const controller = new AgentController({} as AgentService);
    const req = {
      user: { id: 'u1', roles: ['RESTAURANT_OWNER'], permissions: ['agent:read'] },
    } as AuthenticatedRequest;
    await expect(controller.listSessions(req)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
