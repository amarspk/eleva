import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
} from './agent-tools';

export interface AgentInvokeResult {
  sessionId: string;
  actionId: string;
  tool: string;
  status: 'EXECUTED' | 'FAILED';
  sensitivity: 'SAFE';
  result: unknown;
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
        actions: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!session) {
      throw new NotFoundException(`The requested Agent session with ID [${sessionId}] was not found.`);
    }
    return session;
  }

  async invokeSafeTool(
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

    await agentDb(prisma).agentMessage.create({
      data: { sessionId, role: 'USER', content: `invoke ${tool}` },
    });
    await agentDb(prisma).agentMessage.create({
      data: {
        sessionId,
        role: 'TOOL',
        content: status === 'EXECUTED' ? `ok:${tool}` : `failed:${tool}`,
      },
    });

    await this.auditService.log({
      tenantId: null,
      userId,
      action: `AGENT:${tool}:${status}`,
      entityName: 'AgentAction',
      entityId: String(action.id),
      newValues: { tool, status, sensitivity: 'SAFE' },
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
    };
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
