import { AgentToolRegistryService, AgentExecutionService } from './agent.execution';
import { AgentTaskRequest, AgentToolRisk } from './agent.task';
import { AppAbility } from '../auth/casl-ability.factory';
import { AuthenticatedRequest } from '../common/types/request.types';

const MOCK_USER: AuthenticatedRequest['user'] = {
  id: 'user-1',
  email: 'owner@albaik.localhost',
  tenantId: 'tenant-1',
  roles: ['RESTAURANT_OWNER'],
  permissions: ['execute:low-risk', 'read:agent'],
};

const buildAbility = (overrides: { highRiskAuthorized?: boolean } = {}): AppAbility => {
  const ability = { can: jest.fn() } as unknown as AppAbility;
  (ability.can as jest.Mock).mockImplementation((action: string, subject: string) => {
    if (action === 'execute' && subject === 'low-risk') {
      return true;
    }
    if (action === 'execute' && subject === 'high-risk') {
      return overrides.highRiskAuthorized ?? false;
    }
    return false;
  });
  return ability;
};

const buildService = (ability: AppAbility, auditLog = jest.fn()) => {
  const registry = new AgentToolRegistryService();
  const service = new AgentExecutionService(
    registry,
    {} as any,
    { createForUser: () => ability } as any,
    {} as any,
    { log: auditLog } as any,
  );
  return { registry, service };
};

describe('AgentExecutionService', () => {
  const baseRequest = (overrides: Partial<AgentTaskRequest> = {}): AgentTaskRequest => ({
    action: 'demo',
    toolName: 'agent.safe_demo_tool',
    risk: AgentToolRisk.LOW,
    input: { message: 'hello-world' },
    ...overrides,
  });

  it('authorized safe tool execution returns verified result', async () => {
    const { service } = buildService(buildAbility());

    const result = await service.executeTask(baseRequest(), { user: MOCK_USER } as unknown as AuthenticatedRequest);

    expect(result.status).toBe('EXECUTED');
    expect(result.outcome).toBe('EXECUTED');
    expect(result.result).toEqual({ echoed: 'hello-world' });
    expect(result.verification?.passed).toBe(true);
    expect(result.toolName).toBe('agent.safe_demo_tool');
  });

  it('unauthorized execution is blocked', async () => {
    const { registry } = buildService(buildAbility({ highRiskAuthorized: false }));
    registry.registerTool({
      name: 'agent.high_risk_demo_tool',
      description: 'High-risk demo tool.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'high-risk' },
      risk: AgentToolRisk.HIGH,
      requiresApproval: true,
      inputContract: { message: { type: 'string' } },
      outputContract: { echoed: { type: 'string' } },
      execute: async (input: Record<string, unknown>) => ({ echoed: String(input.message ?? '') }),
      verify: async (input: Record<string, unknown>, result: Record<string, unknown>) => result.echoed === String(input.message ?? ''),
    });

    const service = new AgentExecutionService(
      registry,
      {} as any,
      { createForUser: () => buildAbility({ highRiskAuthorized: false }) } as any,
      {} as any,
      undefined,
    );

    const result = await service.executeTask(
      baseRequest({ toolName: 'agent.high_risk_demo_tool', risk: AgentToolRisk.HIGH }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('REJECTED');
    expect(result.outcome).toBe('UNAUTHORIZED');
    expect(result.authorizationError).toContain('[execute on high-risk]');
    expect(result.authorizationError).toContain('[agent.high_risk_demo_tool]');
  });

  it('sensitive tool without approval is blocked', async () => {
    const { registry, service } = buildService(buildAbility({ highRiskAuthorized: true }));
    registry.registerTool({
      name: 'agent.sensitive_demo_tool',
      description: 'Sensitive demo tool requiring approval.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'high-risk' },
      risk: AgentToolRisk.SENSITIVE,
      requiresApproval: true,
      inputContract: { message: { type: 'string' } },
      outputContract: { echoed: { type: 'string' } },
      execute: async (input: Record<string, unknown>) => ({ echoed: String(input.message ?? '') }),
      verify: async (input: Record<string, unknown>, result: Record<string, unknown>) => result.echoed === String(input.message ?? ''),
    });

    const result = await service.executeTask(
      baseRequest({ toolName: 'agent.sensitive_demo_tool', risk: AgentToolRisk.SENSITIVE }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('APPROVAL_REQUIRED');
    expect(result.outcome).toBe('APPROVAL_REQUIRED');
    expect(result.approvalRequired).toBe(true);
  });

  it('sensitive tool with approval can execute', async () => {
    const { registry, service } = buildService(buildAbility({ highRiskAuthorized: true }));
    registry.registerTool({
      name: 'agent.sensitive_demo_tool',
      description: 'Sensitive demo tool requiring approval.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'high-risk' },
      risk: AgentToolRisk.SENSITIVE,
      requiresApproval: true,
      inputContract: { message: { type: 'string' } },
      outputContract: { echoed: { type: 'string' } },
      execute: async (input: Record<string, unknown>) => ({ echoed: String(input.message ?? '') }),
      verify: async (input: Record<string, unknown>, result: Record<string, unknown>) => result.echoed === String(input.message ?? ''),
    });

    const result = await service.executeTask(
      baseRequest({ toolName: 'agent.sensitive_demo_tool', risk: AgentToolRisk.SENSITIVE, approvalActionId: 'approval-1' }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('EXECUTED');
    expect(result.outcome).toBe('EXECUTED');
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalGranted).toBe(true);
  });

  it('denied approval blocks execution', async () => {
    const { registry } = buildService(buildAbility({ highRiskAuthorized: true }));
    registry.registerTool({
      name: 'agent.sensitive_demo_tool',
      description: 'Sensitive demo tool requiring approval.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'high-risk' },
      risk: AgentToolRisk.SENSITIVE,
      requiresApproval: true,
      inputContract: { message: { type: 'string' } },
      outputContract: { echoed: { type: 'string' } },
      execute: async (input: Record<string, unknown>) => ({ echoed: String(input.message ?? '') }),
      verify: async (input: Record<string, unknown>, result: Record<string, unknown>) => result.echoed === String(input.message ?? ''),
    });

    const serviceWithDenial = new AgentExecutionService(
      registry,
      {} as any,
      { createForUser: () => buildAbility({ highRiskAuthorized: true }) } as any,
      {} as any,
      undefined,
    );
    jest.spyOn(serviceWithDenial as any, 'evaluateApproval').mockResolvedValue(false);

    const result = await serviceWithDenial.executeTask(
      baseRequest({ toolName: 'agent.sensitive_demo_tool', risk: AgentToolRisk.SENSITIVE, approvalActionId: 'approval-1' }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('APPROVAL_DENIED');
    expect(result.outcome).toBe('APPROVAL_DENIED');
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalGranted).toBe(false);
  });

  it('tool failure is reported correctly', async () => {
    const { registry, service } = buildService(buildAbility());
    registry.registerTool({
      name: 'agent.failing_demo_tool',
      description: 'Failing demo tool.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'low-risk' },
      risk: AgentToolRisk.LOW,
      requiresApproval: false,
      inputContract: {},
      outputContract: {},
      execute: async () => {
        throw new Error('boom');
      },
    });

    const result = await service.executeTask(
      baseRequest({ toolName: 'agent.failing_demo_tool' }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('FAILED');
    expect(result.outcome).toBe('TOOL_FAILURE');
    expect(result.toolError).toBe('boom');
  });

  it('verification failure is reported correctly', async () => {
    const { registry, service } = buildService(buildAbility());
    registry.registerTool({
      name: 'agent.unverifiable_demo_tool',
      description: 'Unverifiable demo tool.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'low-risk' },
      risk: AgentToolRisk.LOW,
      requiresApproval: false,
      inputContract: { message: { type: 'string' } },
      outputContract: {},
      execute: async (input: Record<string, unknown>) => ({ echoed: String(input.message ?? '') }),
      verify: async () => false,
    });

    const result = await service.executeTask(
      baseRequest({ toolName: 'agent.unverifiable_demo_tool' }),
      { user: MOCK_USER } as unknown as AuthenticatedRequest,
    );

    expect(result.status).toBe('FAILED');
    expect(result.outcome).toBe('VERIFICATION_FAILURE');
    expect(result.verification?.passed).toBe(false);
    expect(result.verificationError).toBe('Verification failed');
  });

  it('generates audit event for execution', async () => {
    const mockAuditLog = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const { service } = buildService(buildAbility(), mockAuditLog);

    const result = await service.executeTask(baseRequest(), { user: MOCK_USER } as unknown as AuthenticatedRequest);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGENT.TASK',
        entityName: 'ElevaTask',
        newValues: expect.objectContaining({
          status: result.status,
          outcome: result.outcome,
          toolName: result.toolName,
        }),
      }),
    );
  });
});
