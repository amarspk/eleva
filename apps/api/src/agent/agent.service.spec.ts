import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AuditService } from '../audit/audit.service';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { findRepoRoot } from './agent-tools';

const store: {
  session: Record<string, unknown> | null;
  actions: Array<Record<string, unknown>>;
  messages: unknown[];
  approvals: Array<Record<string, unknown>>;
} = {
  session: null,
  actions: [],
  messages: [],
  approvals: [],
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
      findUnique: async () => {
        if (!store.session) {
          return null;
        }
        return {
          ...store.session,
          messages: store.messages,
          actions: store.actions.map((action) => ({
            ...action,
            approvals: store.approvals.filter((row) => row.actionId === action.id),
          })),
        };
      },
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
        const row = { id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(store.actions.length).padStart(12, '0')}`, ...data };
        store.actions.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; sessionId: string } }) => {
        const row = store.actions.find((action) => action.id === where.id && action.sessionId === where.sessionId);
        if (!row) {
          return null;
        }
        return {
          ...row,
          approvals: store.approvals.filter((item) => item.actionId === row.id),
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.actions.find((action) => action.id === where.id);
        if (row) {
          Object.assign(row, data);
        }
        return row;
      },
    },
    agentApproval: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `cccccccc-cccc-4ccc-8ccc-${String(store.approvals.length).padStart(12, '0')}`, ...data };
        store.approvals.push(row);
        return row;
      },
    },
  }),
}));

describe('AgentService — V1 Slice 2', () => {
  let service: AgentService;
  const audit = { log: jest.fn().mockResolvedValue(null) };
  const ownerId = 'b0000001-0000-4000-b000-000000000002';
  const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(async () => {
    store.session = {
      id: sessionId,
      userId: ownerId,
      status: 'OPEN',
    };
    store.actions = [];
    store.messages = [];
    store.approvals = [];
    audit.log.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentService, { provide: AuditService, useValue: audit }],
    }).compile();
    service = module.get(AgentService);
  });

  it('creates a platform-owned session and writes an audit row', async () => {
    const session = await service.createSession(ownerId, 'Inspect');
    expect(session).toMatchObject({ title: 'Inspect', status: 'OPEN' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: null,
      action: 'AGENT:session:create',
      entityName: 'AgentSession',
    }));
  });

  it('executes read_project_state as a SAFE EXECUTED action', async () => {
    const result = await service.invokeTool(sessionId, ownerId, 'read_project_state', {});
    expect(result.status).toBe('EXECUTED');
    expect(result.sensitivity).toBe('SAFE');
    expect(result.executed).toBe(true);
    expect(String((result.result as { content?: string }).content)).toContain('# PROJECT STATE');
    expect(store.actions[0]).toMatchObject({ tool: 'read_project_state', status: 'EXECUTED' });
  });

  it('does not execute a denied repo path (FAILED action, no secret content)', async () => {
    const result = await service.invokeTool(sessionId, ownerId, 'read_repo_file', { path: '.env' });
    expect(result.status).toBe('FAILED');
    expect(JSON.stringify(result.result)).toMatch(/Access denied/);
    expect(JSON.stringify(result.result)).not.toMatch(/SENDGRID_API_KEY\s*=/);
  });

  it('persists propose_plan as a SENSITIVE PROPOSED action without executing', async () => {
    const result = await service.invokeTool(sessionId, ownerId, 'propose_plan', {
      summary: 'Roll out receipt footer change',
      steps: ['Draft copy', 'Owner review'],
    });
    expect(result.status).toBe('PROPOSED');
    expect(result.sensitivity).toBe('SENSITIVE');
    expect(result.executed).toBe(false);
    expect(store.actions[0]).toMatchObject({
      tool: 'propose_plan',
      status: 'PROPOSED',
      sensitivity: 'SENSITIVE',
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: null,
      action: 'AGENT:propose_plan:PROPOSED',
      newValues: expect.objectContaining({ executed: false }),
    }));
  });

  it('does not execute apply_patch even when invoked (proposal only)', async () => {
    const result = await service.invokeTool(sessionId, ownerId, 'apply_patch', { path: 'apps/api/src/main.ts' });
    expect(result.status).toBe('PROPOSED');
    expect(result.executed).toBe(false);
    expect(JSON.stringify(result.result)).toMatch(/AWAITING_APPROVAL/);
    expect(store.actions[0]).toMatchObject({ tool: 'apply_patch', status: 'PROPOSED' });
  });

  it('stores a structured plan (objective, files, verification, risk)', async () => {
    const result = await service.invokeTool(sessionId, ownerId, 'propose_plan', {
      objective: 'Tighten receipt footer copy',
      summary: 'Receipt footer',
      filesAffected: ['apps/backoffice/src/app/components/ReceiptDesigner.tsx'],
      intendedChanges: ['No write until later slice'],
      verificationSteps: ['Re-read PROJECT_STATE.md'],
      riskLevel: 'low',
    });
    expect(result.result).toMatchObject({
      workflowState: 'AWAITING_APPROVAL',
      objective: 'Tighten receipt footer copy',
      filesAffected: ['apps/backoffice/src/app/components/ReceiptDesigner.tsx'],
      riskLevel: 'low',
    });
  });

  it('approve runs controlled verification and records COMPLETED', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'propose_plan', { summary: 'Plan A' });
    await expect(service.executeApprovedPlan(sessionId, proposed.actionId, ownerId)).rejects.toBeInstanceOf(ConflictException);
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', 'looks good');
    expect(decision.workflowState).toBe('COMPLETED');
    expect(decision.executed).toBe(true);
    expect(store.approvals[0]).toMatchObject({
      actionId: proposed.actionId,
      approverUserId: ownerId,
      decision: 'APPROVED',
      reason: 'looks good',
    });
    expect(store.actions[0].status).toBe('COMPLETED');
    expect((store.actions[0].result as { verification?: { passed?: boolean } }).verification?.passed).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AGENT:propose_plan:APPROVED',
      entityName: 'AgentApproval',
    }));
  });

  it('approved apply_patch stays blocked (no source mutation)', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'apply_patch', { path: 'apps/api/src/main.ts' });
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', undefined);
    expect(decision.executed).toBe(false);
    expect(decision.workflowState).toBe('COMPLETED');
    expect(JSON.stringify(store.actions[0].result)).toMatch(/blocked-sensitive/);
  });

  it('reject creates a rejection approval record', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'deploy', { environment: 'production' });
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'REJECTED', 'not now');
    expect(decision.status).toBe('REJECTED');
    expect(store.approvals[0]).toMatchObject({ decision: 'REJECTED', reason: 'not now' });
    expect(store.actions[0].status).toBe('REJECTED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AGENT:deploy:REJECTED',
    }));
  });

  it('does not execute after approval (second decide is a conflict)', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'propose_plan', { summary: 'Plan B' });
    await service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', undefined);
    await expect(
      service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.actions.filter((row) => row.status === 'EXECUTED')).toHaveLength(0);
  });

  it('keeps Agent records platform-scoped (audit tenantId is always null)', async () => {
    await service.createSession(ownerId, 'Isolation');
    await service.invokeTool(sessionId, ownerId, 'git_status', {});
    expect(audit.log.mock.calls.every((call) => call[0].tenantId === null)).toBe(true);
  });

  it('does not execute write_agent_note until approved', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'write_agent_note', {
      filename: 'slice5-service',
      body: 'hello',
    });
    expect(proposed.status).toBe('PROPOSED');
    expect(proposed.executed).toBe(false);
    await expect(service.executeApprovedPlan(sessionId, proposed.actionId, ownerId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not execute a rejected write_agent_note', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'write_agent_note', {
      filename: 'slice5-rejected',
      body: 'nope',
    });
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'REJECTED', 'no');
    expect(decision.workflowState).toBe('REJECTED');
    await expect(service.executeApprovedPlan(sessionId, proposed.actionId, ownerId)).rejects.toBeInstanceOf(ConflictException);
    expect(store.actions[0].status).toBe('REJECTED');
  });

  it('executes an approved write_agent_note and records audit + COMPLETED', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'write_agent_note', {
      filename: 'slice5-service',
      body: 'approved note body',
    });
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', 'ok');
    expect(decision.workflowState).toBe('COMPLETED');
    expect(decision.executed).toBe(true);
    expect((store.actions[0].result as { execution?: { path?: string } }).execution?.path)
      .toBe('docs/agent-workspace/slice5-service.md');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'AGENT:write_agent_note:COMPLETED',
    }));
    const written = path.join(findRepoRoot(), 'docs/agent-workspace/slice5-service.md');
    expect(fs.readFileSync(written, 'utf8')).toBe('approved note body');
    fs.unlinkSync(written);
  });

  it('marks FAILED when an approved write has an invalid operation payload', async () => {
    const proposed = await service.invokeTool(sessionId, ownerId, 'write_agent_note', {
      filename: 'slice5-bad',
      body: 'x',
    });
    store.actions[0].input = { filename: '../etc/passwd', body: 'x' };
    const decision = await service.decideAction(sessionId, proposed.actionId, ownerId, 'APPROVED', undefined);
    expect(decision.workflowState).toBe('FAILED');
    expect(decision.executed).toBe(false);
    expect(JSON.stringify(store.actions[0].result)).toMatch(/filename|FAILED/);
  });
});

describe('AgentController authorization', () => {
  it.each([
    ['createSession', 'create'],
    ['listSessions', 'read'],
    ['getSession', 'read'],
    ['invoke', 'create'],
    ['chat', 'create'],
    ['approveAction', 'update'],
    ['rejectAction', 'update'],
  ] as const)('%s requires %s on Agent', (method, action) => {
    const meta = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AgentController.prototype[method]);
    expect(meta).toEqual({ action, resource: 'Agent' });
  });

  it('403s restaurant staff even if the request is authenticated', async () => {
    const controller = new AgentController({} as AgentService, {} as never);
    const req = {
      user: { id: 'u1', roles: ['RESTAURANT_OWNER'], permissions: ['agent:read', 'agent:update'] },
    } as AuthenticatedRequest;
    await expect(controller.listSessions(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.approveAction(req, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows PLATFORM_OWNER to reach listSessions', async () => {
    const listSessions = jest.fn().mockResolvedValue([]);
    const controller = new AgentController({ listSessions } as unknown as AgentService, {} as never);
    const req = {
      user: { id: 'u1', roles: ['PLATFORM_OWNER'], permissions: ['agent:read'] },
    } as AuthenticatedRequest;
    await expect(controller.listSessions(req)).resolves.toEqual([]);
    expect(listSessions).toHaveBeenCalled();
  });
});
