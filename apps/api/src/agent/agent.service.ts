import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { prisma } from '@zayjar/db';
import { AuditService } from '../audit/audit.service';
import { agentDb } from './agent-db';
import {
  findRepoRoot,
  gitLog,
  gitStatus,
  readProjectState,
  readRepoFile,
  SAFE_AGENT_TOOLS,
  PLAN_AGENT_TOOLS,
  SENSITIVE_AGENT_TOOLS,
} from './agent-tools';

export interface AgentInvokeResult {
  sessionId: string;
  actionId: string;
  tool: string;
  status: 'EXECUTED' | 'FAILED' | 'PROPOSED';
  sensitivity: 'SAFE' | 'SENSITIVE';
  result: unknown;
  executed: boolean;
}

export interface AgentDecisionResult {
  actionId: string;
  sessionId: string;
  decision: 'APPROVED' | 'REJECTED';
  status: 'APPROVED' | 'REJECTED';
  approvalId: string;
  executed: false;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');

  constructor(private readonly auditService: AuditService) {}

  async createSession(userId: string, title?: string, ip = 'unknown', userAgent = 'unknown'): Promise<Record<string, unknown>> {
    const session = await agentDb(prisma).agentSession.create({
      data: {
        userId,
        title: title?.trim() || 'Agent session',
        status: 'OPEN',
      },
    });
    await this.auditService.log({
      tenantId: null,
      userId,
      action: 'AGENT:session:create',
      entityName: 'AgentSession',
      entityId: String(session.id),
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });
    return session;
  }

  async listSessions(): Promise<Array<Record<string, unknown>>> {
    return agentDb(prisma).agentSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getSession(sessionId: string): Promise<Record<string, unknown>> {
    const session = await agentDb(prisma).agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { approvals: { orderBy: { decidedAt: 'desc' } } },
        },
      },
    });
    if (!session) {
      throw new NotFoundException(`The requested Agent session with ID [${sessionId}] was not found.`);
    }
    return session;
  }

  async invokeTool(
    sessionId: string,
    userId: string,
    tool: string,
    args: Record<string, unknown> | undefined,
    ip = 'unknown',
    userAgent = 'unknown',
  ): Promise<AgentInvokeResult> {
    const session = await agentDb(prisma).agentSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`The requested Agent session with ID [${sessionId}] was not found.`);
    }

    if (SAFE_AGENT_TOOLS.includes(tool as (typeof SAFE_AGENT_TOOLS)[number])) {
      return this.invokeSafeTool(sessionId, userId, tool, args, ip, userAgent);
    }

    if (
      PLAN_AGENT_TOOLS.includes(tool as (typeof PLAN_AGENT_TOOLS)[number])
      || SENSITIVE_AGENT_TOOLS.includes(tool as (typeof SENSITIVE_AGENT_TOOLS)[number])
    ) {
      return this.proposeSensitive(sessionId, userId, tool, args ?? {}, ip, userAgent);
    }

    throw new BadRequestException(`Tool [${tool}] is not a V1 Agent tool.`);
  }

  /** Slice 1 compatibility name. */
  async invokeSafeTool(
    sessionId: string,
    userId: string,
    tool: string,
    args: Record<string, unknown> | undefined,
    ip = 'unknown',
    userAgent = 'unknown',
  ): Promise<AgentInvokeResult> {
    if (!SAFE_AGENT_TOOLS.includes(tool as (typeof SAFE_AGENT_TOOLS)[number])) {
      throw new BadRequestException(`Tool [${tool}] is not a V1 SAFE Agent tool.`);
    }

    let result: unknown;
    let status: 'EXECUTED' | 'FAILED' = 'EXECUTED';
    try {
      result = this.executeSafeTool(tool, args ?? {});
    } catch (err) {
      status = 'FAILED';
      result = { error: (err as Error).message };
    }

    const action = await agentDb(prisma).agentAction.create({
      data: {
        sessionId,
        tool,
        input: this.sanitizeInput(args ?? {}),
        result,
        status,
        sensitivity: 'SAFE',
      },
    });

    await this.recordMessages(sessionId, tool, status === 'EXECUTED' ? `ok:${tool}` : `failed:${tool}`);

    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${tool}:${status}`,
      entityName: 'AgentAction',
      entityId: String(action.id),
      newValues: { tool, status, sensitivity: 'SAFE', executed: status === 'EXECUTED' },
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });

    this.logger.log(`Agent tool [${tool}] ${status} session [${sessionId}]`);
    return {
      sessionId,
      actionId: String(action.id),
      tool,
      status,
      sensitivity: 'SAFE',
      result,
      executed: status === 'EXECUTED',
    };
  }

  private async proposeSensitive(
    sessionId: string,
    userId: string,
    tool: string,
    args: Record<string, unknown>,
    ip: string,
    userAgent: string,
  ): Promise<AgentInvokeResult> {
    const plan = this.buildPlan(tool, args);
    const result = {
      proposed: true,
      executed: false,
      executionDisabled: true,
      slice: 'v1-slice-2',
      summary: plan.summary,
      steps: plan.steps,
      note: 'Slice 2 records the proposal only. Sensitive execution is disabled even after approval.',
    };

    const action = await agentDb(prisma).agentAction.create({
      data: {
        sessionId,
        tool,
        input: this.sanitizeInput(args),
        result,
        status: 'PROPOSED',
        sensitivity: 'SENSITIVE',
      },
    });

    await this.recordMessages(sessionId, `propose ${tool}`, `proposed:${tool}`);

    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${tool}:PROPOSED`,
      entityName: 'AgentAction',
      entityId: String(action.id),
      newValues: { tool, status: 'PROPOSED', sensitivity: 'SENSITIVE', executed: false },
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });

    this.logger.log(`Agent tool [${tool}] PROPOSED session [${sessionId}] (not executed)`);
    return {
      sessionId,
      actionId: String(action.id),
      tool,
      status: 'PROPOSED',
      sensitivity: 'SENSITIVE',
      result,
      executed: false,
    };
  }

  async decideAction(
    sessionId: string,
    actionId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | undefined,
    ip = 'unknown',
    userAgent = 'unknown',
  ): Promise<AgentDecisionResult> {
    const action = await agentDb(prisma).agentAction.findFirst({
      where: { id: actionId, sessionId },
      include: { approvals: true },
    });
    if (!action) {
      throw new NotFoundException(`The requested Agent action with ID [${actionId}] was not found.`);
    }
    if (action.sensitivity !== 'SENSITIVE') {
      throw new BadRequestException('Only SENSITIVE proposed actions can be approved or rejected.');
    }
    if (action.status !== 'PROPOSED') {
      throw new ConflictException(`Action [${actionId}] is already ${String(action.status)}.`);
    }

    const approval = await agentDb(prisma).agentApproval.create({
      data: {
        actionId,
        approverUserId: userId,
        decision,
        reason: reason?.trim() || null,
      },
    });

    await agentDb(prisma).agentAction.update({
      where: { id: actionId },
      data: { status: decision },
    });

    await agentDb(prisma).agentMessage.create({
      data: {
        sessionId,
        role: 'SYSTEM',
        content: `${decision.toLowerCase()}:${String(action.tool)}`,
      },
    });

    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${String(action.tool)}:${decision}`,
      entityName: 'AgentApproval',
      entityId: String(approval.id),
      newValues: {
        actionId,
        decision,
        status: decision,
        executed: false,
        executionDisabled: true,
      },
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });

    return {
      actionId,
      sessionId,
      decision,
      status: decision,
      approvalId: String(approval.id),
      executed: false,
    };
  }

  private buildPlan(tool: string, args: Record<string, unknown>): { summary: string; steps: string[] } {
    const summary = String(args.summary ?? args.goal ?? `Proposed ${tool} (not executed)`).slice(0, 500);
    const rawSteps = args.steps;
    const steps = Array.isArray(rawSteps)
      ? rawSteps.map((step) => String(step).slice(0, 300)).slice(0, 20)
      : [`Record ${tool} as a proposed change.`, 'Await PLATFORM_OWNER approval.', 'Do not execute in Slice 2.'];
    return { summary, steps };
  }

  private async recordMessages(sessionId: string, userContent: string, toolContent: string): Promise<void> {
    await agentDb(prisma).agentMessage.create({
      data: { sessionId, role: 'USER', content: userContent },
    });
    await agentDb(prisma).agentMessage.create({
      data: { sessionId, role: 'TOOL', content: toolContent },
    });
  }

  private executeSafeTool(tool: string, args: Record<string, unknown>): unknown {
    const repoRoot = findRepoRoot();
    switch (tool) {
      case 'read_project_state':
        return readProjectState(repoRoot);
      case 'read_repo_file':
        return readRepoFile(repoRoot, String(args.path ?? ''));
      case 'git_status':
        return gitStatus(repoRoot);
      case 'git_log':
        return gitLog(repoRoot, Number(args.limit ?? 10));
      default:
        throw new BadRequestException(`Tool [${tool}] is not a V1 SAFE Agent tool.`);
    }
  }

  private sanitizeInput(args: Record<string, unknown>): Record<string, unknown> {
    const blocked = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    const copy: Record<string, unknown> = { ...args };
    for (const key of Object.keys(copy)) {
      if (blocked.some((item) => key.toLowerCase().includes(item))) {
        copy[key] = '[REDACTED]';
      }
    }
    return copy;
  }
}
