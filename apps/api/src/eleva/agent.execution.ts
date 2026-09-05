import { Injectable, Logger, ForbiddenException, NotFoundException, Optional } from '@nestjs/common';
import { AgentTaskRequest, AgentToolDefinition, AgentTaskResult, AgentTaskStatus, AgentTaskOutcome, AgentToolRisk } from './agent.task';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { AppAbility, Action, Subjects, CaslAbilityFactory } from '../auth/casl-ability.factory';
import { AuthenticatedRequest } from '../common/types/request.types';
import { AuditService } from '../audit/audit.service';
import { ElevaService } from './eleva.service';

const SAFE_TOOL_NAME = 'agent.safe_demo_tool';

@Injectable()
export class AgentToolRegistryService {
  private readonly logger = new Logger(AgentToolRegistryService.name);
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor() {
    this.registerTool({
      name: SAFE_TOOL_NAME,
      description: 'Minimum safe demonstration tool for the M2 execution pipeline.',
      capability: 'DEVELOPMENT',
      requiredPermission: { action: 'execute', resource: 'low-risk' },
      risk: AgentToolRisk.LOW,
      requiresApproval: false,
      inputContract: { message: { type: 'string' } },
      outputContract: { echoed: { type: 'string' } },
      execute: async (input) => ({ echoed: String(input.message ?? '') }),
      verify: async (input, result) => {
        const expected = String(input.message ?? '');
        return result.echoed === expected;
      },
    });
  }

  registerTool(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered ELEVA tool: ${tool.name} risk=${tool.risk} requiresApproval=${tool.requiresApproval}`);
  }

  getTool(name: string): AgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({ ...tool }));
  }
}

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);

  constructor(
    private readonly toolRegistry: AgentToolRegistryService,
    private readonly rbacPermissionGuard: RbacPermissionGuard,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly elevaService: ElevaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async executeTask(request: AgentTaskRequest, authenticatedRequest: AuthenticatedRequest): Promise<AgentTaskResult> {
    const taskId = this.generateTaskId();
    const tool = this.resolveTool(request);
    const requiredPermission = tool.requiredPermission;

    const user = this.requireUser(authenticatedRequest);
    const ability = this.caslAbilityFactory.createForUser(user);

    const authorization = this.authorizeTask(ability, requiredPermission, tool);
    if (!authorization.allowed) {
      const result: AgentTaskResult = {
        taskId,
        status: AgentTaskStatus.REJECTED,
        outcome: AgentTaskOutcome.UNAUTHORIZED,
        action: request.action,
        toolName: tool.name,
        requiredPermission,
        risk: tool.risk,
        approvalRequired: tool.requiresApproval,
        authorizationError: authorization.error,
      };

      await this.audit(taskId, result);
      return result;
    }

    if (tool.requiresApproval && !request.approvalActionId) {
      const result: AgentTaskResult = {
        taskId,
        status: AgentTaskStatus.APPROVAL_REQUIRED,
        outcome: AgentTaskOutcome.APPROVAL_REQUIRED,
        action: request.action,
        toolName: tool.name,
        requiredPermission,
        risk: tool.risk,
        approvalRequired: true,
        approvalGranted: false,
      };

      await this.audit(taskId, result);
      return result;
    }

    if (tool.requiresApproval) {
      const approvalGranted = await this.evaluateApproval(user, request.approvalActionId!, tool);
      if (!approvalGranted) {
        const result: AgentTaskResult = {
          taskId,
          status: AgentTaskStatus.APPROVAL_DENIED,
          outcome: AgentTaskOutcome.APPROVAL_DENIED,
          action: request.action,
          toolName: tool.name,
          requiredPermission,
          risk: tool.risk,
          approvalRequired: true,
          approvalGranted: false,
        };

        await this.audit(taskId, result);
        return result;
      }
    }

    const validatedInput = this.validateInput(tool.inputContract, request.input);
    if (!validatedInput.valid) {
      const result: AgentTaskResult = {
        taskId,
        status: AgentTaskStatus.REJECTED,
        outcome: AgentTaskOutcome.INVALID_INPUT,
        action: request.action,
        toolName: tool.name,
        requiredPermission,
        risk: tool.risk,
        approvalRequired: tool.requiresApproval,
        approvalGranted: tool.requiresApproval ? true : undefined,
        validationError: validatedInput.error,
      };

      await this.audit(taskId, result);
      return result;
    }

    let executionResult: Record<string, unknown> | undefined;
    try {
      executionResult = await tool.execute(validatedInput.input!);
    } catch (error) {
      const result: AgentTaskResult = {
        taskId,
        status: AgentTaskStatus.FAILED,
        outcome: AgentTaskOutcome.TOOL_FAILURE,
        action: request.action,
        toolName: tool.name,
        requiredPermission,
        risk: tool.risk,
        approvalRequired: tool.requiresApproval,
        approvalGranted: tool.requiresApproval ? true : undefined,
        toolError: error instanceof Error ? error.message : 'Unknown tool failure',
      };

      await this.audit(taskId, result);
      return result;
    }

    let verification: AgentTaskResult['verification'] = undefined;
    if (typeof tool.verify === 'function') {
      const passed = await tool.verify(validatedInput.input!, executionResult);
      verification = { passed };
      if (!passed) {
        const result: AgentTaskResult = {
          taskId,
          status: AgentTaskStatus.FAILED,
          outcome: AgentTaskOutcome.VERIFICATION_FAILURE,
          action: request.action,
          toolName: tool.name,
          requiredPermission,
          risk: tool.risk,
          approvalRequired: tool.requiresApproval,
          approvalGranted: tool.requiresApproval ? true : undefined,
          result: executionResult,
          verificationError: 'Verification failed',
          verification,
        };

        await this.audit(taskId, result);
        return result;
      }
    }

    const verificationRequired = tool.risk === 'HIGH' || tool.risk === 'SENSITIVE';
    const verified = !verificationRequired || (verification?.passed === true);
    if (verificationRequired && !verified) {
      const result: AgentTaskResult = {
        taskId,
        status: AgentTaskStatus.FAILED,
        outcome: AgentTaskOutcome.VERIFICATION_FAILURE,
        action: request.action,
        toolName: tool.name,
        requiredPermission,
        risk: tool.risk,
        approvalRequired: tool.requiresApproval,
        approvalGranted: tool.requiresApproval ? true : undefined,
        result: executionResult,
        verificationError: 'Verification failed',
        verification,
      };

      await this.audit(taskId, result);
      return result;
    }

    const result: AgentTaskResult = {
      taskId,
      status: AgentTaskStatus.EXECUTED,
      outcome: AgentTaskOutcome.EXECUTED,
      action: request.action,
      toolName: tool.name,
      requiredPermission,
      risk: tool.risk,
      approvalRequired: tool.requiresApproval,
      approvalGranted: tool.requiresApproval ? true : undefined,
      result: executionResult,
      verification,
      executedAt: new Date(),
    };

    await this.audit(taskId, result);
    return result;
  }

  private resolveTool(request: AgentTaskRequest): AgentToolDefinition {
    if (request.toolName) {
      const tool = this.toolRegistry.getTool(request.toolName);
      if (tool) {
        return tool;
      }
    }

    if (request.capability) {
      const fallback = this.toolRegistry.listTools().find((item) => item.capability === request.capability);
      if (fallback) {
        return fallback;
      }
    }

    const safeDefault = this.toolRegistry.getTool(SAFE_TOOL_NAME);
    if (safeDefault) {
      return safeDefault;
    }

    throw new NotFoundException('No authorized ELEVA tool is available for the requested task.');
  }

  private requireUser(request: AuthenticatedRequest): NonNullable<AuthenticatedRequest['user']> {
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication credentials were not resolved before the ELEVA task pipeline.');
    }
    return user;
  }

  private authorizeTask(
    ability: AppAbility,
    requiredPermission: { action: string; resource: string },
    tool: AgentToolDefinition,
  ): { allowed: boolean; error?: string } {
    if (ability.can(requiredPermission.action as Action, requiredPermission.resource as Subjects)) {
      return { allowed: true };
    }

    const message = `Access Denied: ELEVA task requires [${requiredPermission.action} on ${requiredPermission.resource}] for tool [${tool.name}].`;
    this.logger.warn(message);
    return { allowed: false, error: message };
  }

  private async evaluateApproval(_user: NonNullable<AuthenticatedRequest['user']>, _approvalActionId: string, _tool: AgentToolDefinition): Promise<boolean> {
    this.logger.log(`ELEVA approval evaluation for actionId=${_approvalActionId} tool=${_tool.name}`);
    return true;
  }

  private validateInput(contract: Record<string, unknown>, input?: Record<string, unknown>): { valid: boolean; input?: Record<string, unknown>; error?: string } {
    if (!input) {
      if (Object.keys(contract).length === 0) {
        return { valid: true, input: {} };
      }

      return { valid: false, error: 'Missing required task input.' };
    }

    return { valid: true, input };
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async audit(taskId: string, result: AgentTaskResult): Promise<void> {
    if (!this.auditService?.log) {
      return;
    }

    try {
      await this.auditService.log({
        tenantId: null,
        userId: null,
        action: result.auditAction ?? 'AGENT.TASK',
        entityName: result.auditEntityName ?? 'ElevaTask',
        entityId: result.auditEntityId ?? taskId,
        oldValues: null,
        newValues: {
          taskId,
          status: result.status,
          outcome: result.outcome,
          action: result.action,
          toolName: result.toolName,
          risk: result.risk,
          approvalRequired: result.approvalRequired,
          approvalGranted: result.approvalGranted,
          authorizationError: result.authorizationError,
          validationError: result.validationError,
          toolError: result.toolError,
          verificationError: result.verificationError,
          verification: result.verification,
          executedAt: result.executedAt,
          auditedAt: new Date(),
        } as Record<string, unknown>,
        ipAddress: 'system',
        userAgent: 'eleva-execution-pipeline',
      });
    } catch (error) {
      this.logger.error(`Failed to emit ELEVA task audit log: ${(error as Error).message}`);
    }
  }
}
