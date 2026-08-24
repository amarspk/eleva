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
import {
  buildStructuredWorkPlan,
  deriveWorkflowState,
  isBlockedSensitiveTool,
  type AgentWorkflowState,
} from './agent-workflow';
import { ControlledAgentExecutor, isControlledAgentTool } from './agent-executor';

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
  status: string;
  approvalId: string;
  executed: boolean;
  workflowState: AgentWorkflowState;
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
      || isControlledAgentTool(tool)
    ) {
      return this.proposeSensitive(sessionId, userId, tool, args ?? {}, ip, userAgent);
    }

    throw new BadRequestException(`Tool [${tool}] is not a V1 Agent tool.`);
  }

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
    const plan = buildStructuredWorkPlan(tool, args);
    const result = {
      proposed: true,
      executed: false,
      workflowState: 'AWAITING_APPROVAL' as AgentWorkflowState,
      slice: 'v1-slice-9',
      ...plan,
      note: tool === 'apply_approved_implementation'
        ? 'Awaiting PLATFORM_OWNER approval. apply_approved_implementation may copy one verified draft to apps/api/src/agent/promoted.ts only.'
        : tool === 'analyze_implementation_file'
        ? 'Awaiting PLATFORM_OWNER approval. analyze_implementation_file reads a verified sandbox draft only and does not write.'
        : tool === 'verify_implementation_file'
          ? 'Awaiting PLATFORM_OWNER approval. verify_implementation_file inspects TypeScript drafts under apps/api/src/agent/implementation/ only and does not write.'
          : tool === 'write_implementation_file'
          ? 'Awaiting PLATFORM_OWNER approval. write_implementation_file may write TypeScript only under apps/api/src/agent/implementation/.'
          : tool === 'write_agent_note'
            ? 'Awaiting PLATFORM_OWNER approval. write_agent_note may write only under docs/agent-workspace/.'
            : 'Awaiting PLATFORM_OWNER approval. Destructive tools stay blocked after approval.',
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
      newValues: { tool, status: 'PROPOSED', sensitivity: 'SENSITIVE', executed: false, workflowState: 'AWAITING_APPROVAL' },
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

    let executed = false;
    let workflowState: AgentWorkflowState = decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    if (decision === 'APPROVED') {
      const run = await this.executeApprovedPlan(sessionId, actionId, userId, ip, userAgent);
      executed = run.executed;
      workflowState = run.workflowState;
    }

    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${String(action.tool)}:${decision}`,
      entityName: 'AgentApproval',
      entityId: String(approval.id),
      newValues: {
        actionId,
        decision,
        status: workflowState,
        executed,
        workflowState,
      },
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });

    return {
      actionId,
      sessionId,
      decision,
      status: workflowState,
      approvalId: String(approval.id),
      executed,
      workflowState,
    };
  }

  async executeApprovedPlan(
    sessionId: string,
    actionId: string,
    userId: string,
    ip = 'unknown',
    userAgent = 'unknown',
  ): Promise<{ executed: boolean; workflowState: AgentWorkflowState }> {
    const action = await agentDb(prisma).agentAction.findFirst({
      where: { id: actionId, sessionId },
    });
    if (!action) {
      throw new NotFoundException(`The requested Agent action with ID [${actionId}] was not found.`);
    }
    if (String(action.status) !== 'APPROVED') {
      throw new ConflictException(
        `Action [${actionId}] cannot execute from state ${deriveWorkflowState(String(action.status))}. Approval is required.`,
      );
    }

    const tool = String(action.tool);
    const previous = (action.result && typeof action.result === 'object')
      ? action.result as Record<string, unknown>
      : {};

    await agentDb(prisma).agentAction.update({
      where: { id: actionId },
      data: { status: 'EXECUTING' },
    });

    if (isBlockedSensitiveTool(tool)) {
      const blockedResult = {
        ...previous,
        workflowState: 'COMPLETED',
        executed: false,
        execution: {
          kind: 'blocked-sensitive',
          ran: false,
          blockedTool: tool,
          note: 'Controlled layer does not run apply_patch, deploy, migrations, or secret changes.',
        },
        verification: { passed: true, projectModified: false, checks: ['sensitive-tool-blocked'] },
      };
      await agentDb(prisma).agentAction.update({
        where: { id: actionId },
        data: { status: 'COMPLETED', result: blockedResult },
      });
      await this.auditService.log({
        tenantId: null,
        userId,
        action: `AGENT:${tool}:BLOCKED`,
        entityName: 'AgentAction',
        entityId: actionId,
        newValues: { executed: false, workflowState: 'COMPLETED', blocked: true },
        ipAddress: ip,
        userAgent: userAgent.slice(0, 512),
      });
      return { executed: false, workflowState: 'COMPLETED' };
    }

    await agentDb(prisma).agentAction.update({
      where: { id: actionId },
      data: { status: 'VERIFYING' },
    });

    const input = (action.input && typeof action.input === 'object')
      ? action.input as Record<string, unknown>
      : {};
    let verification: Record<string, unknown>;
    let workflowState: AgentWorkflowState = 'COMPLETED';
    let execution: Record<string, unknown> = {
      kind: 'controlled-verification',
      ran: true,
      blockedTool: null,
      note: 'SAFE inspection only. No source files were written.',
    };

    if (isControlledAgentTool(tool)) {
      if (tool === 'apply_approved_implementation') {
        const session = await this.getSession(sessionId);
        const actions = Array.isArray(session.actions) ? session.actions as Array<Record<string, unknown>> : [];
        const slug = String(input.filename ?? input.name ?? '');
        const completed = (name: string): boolean => actions.some((row) => {
          const rowInput = row.input && typeof row.input === 'object' ? row.input as Record<string, unknown> : {};
          return String(row.tool) === name && String(row.status) === 'COMPLETED' && String(rowInput.filename ?? '') === slug;
        });
        if (!completed('verify_implementation_file') || !completed('analyze_implementation_file')) {
          const missing = !completed('verify_implementation_file') ? 'verify_implementation_file' : 'analyze_implementation_file';
          workflowState = 'FAILED';
          execution = {
            kind: tool,
            ran: false,
            source: `apps/api/src/agent/implementation/${slug}.ts`,
            target: 'apps/api/src/agent/promoted.ts',
            approved: true,
            written: false,
            note: `Missing completed ${missing} prerequisite for [${slug}].`,
          };
          verification = { passed: false, failed: true, error: `Missing completed ${missing} prerequisite for [${slug}].` };
          const nextResult = { ...previous, workflowState, executed: false, execution, verification };
          await agentDb(prisma).agentAction.update({ where: { id: actionId }, data: { status: workflowState, result: nextResult } });
          await this.auditService.log({
            tenantId: null, userId, action: `AGENT:${tool}:${workflowState}`, entityName: 'AgentAction', entityId: actionId,
            newValues: { executed: false, workflowState }, ipAddress: ip, userAgent: userAgent.slice(0, 512),
          });
          return { executed: false, workflowState };
        }
      }
      const executor = new ControlledAgentExecutor();
      const request = { tool, args: input, approvedPlan: previous };
      try {
        const ran = executor.execute(request);
        execution = {
          kind: ran.kind,
          ran: ran.ran,
          path: ran.path,
          bytes: ran.bytes,
          source: tool === 'apply_approved_implementation' ? `apps/api/src/agent/implementation/${String(input.filename ?? '')}.ts` : undefined,
          target: tool === 'apply_approved_implementation' ? 'apps/api/src/agent/promoted.ts' : undefined,
          approved: tool === 'apply_approved_implementation' ? true : undefined,
          written: tool === 'apply_approved_implementation' ? ran.ran : undefined,
          blockedTool: null,
          note: ran.kind === 'apply_approved_implementation'
            ? 'Copied one verified sandbox draft to apps/api/src/agent/promoted.ts only.'
            : ran.kind === 'analyze_implementation_file'
            ? 'Analyzed sandbox TypeScript draft only. No files were written.'
            : ran.kind === 'verify_implementation_file'
              ? 'Inspected sandbox TypeScript draft only. No files were written.'
              : ran.kind === 'write_implementation_file'
                ? 'Wrote TypeScript draft under apps/api/src/agent/implementation/ only.'
                : 'Wrote markdown under docs/agent-workspace/ only.',
        };
        const verified = executor.verify(request, ran);
        verification = { ...verified };
        workflowState = verified.passed ? 'COMPLETED' : 'FAILED';
      } catch (error) {
        workflowState = 'FAILED';
        execution = {
          kind: isControlledAgentTool(tool) ? tool : 'write_agent_note',
          ran: false,
          blockedTool: null,
          note: (error as Error).message,
        };
        verification = { passed: false, projectModified: false, error: (error as Error).message };
      }
    } else {
      try {
        const repoRoot = findRepoRoot();
        const state = readProjectState(repoRoot);
        const status = gitStatus(repoRoot);
        verification = {
          passed: true,
          projectModified: false,
          checks: ['read_project_state', 'git_status'],
          projectStateBytes: state.bytes,
          gitBranchLine: String(status.output).split('\n')[0] || '',
        };
      } catch (error) {
        workflowState = 'FAILED';
        verification = { passed: false, projectModified: false, error: (error as Error).message };
      }
    }

    const nextResult = {
      ...previous,
      workflowState,
      executed: workflowState === 'COMPLETED' && (isControlledAgentTool(tool) ? Boolean(execution.ran) : true),
      execution,
      verification,
    };

    await agentDb(prisma).agentAction.update({
      where: { id: actionId },
      data: { status: workflowState, result: nextResult },
    });
    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${tool}:${workflowState}`,
      entityName: 'AgentAction',
      entityId: actionId,
      newValues: { executed: workflowState === 'COMPLETED', workflowState },
      ipAddress: ip,
      userAgent: userAgent.slice(0, 512),
    });
    return { executed: workflowState === 'COMPLETED', workflowState };
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
