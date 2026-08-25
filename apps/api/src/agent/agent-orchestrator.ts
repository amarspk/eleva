import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma } from '@zayjar/db';
import { agentDb } from './agent-db';
import { AgentService } from './agent.service';
import { findRepoRoot, listApprovedProjectSpecs, readProjectState } from './agent-tools';
import {
  AGENT_LLM_PROVIDER,
  ALLOWLISTED_SAFE_TOOLS,
  type AgentLlmDecision,
  type AgentLlmMessage,
  type AgentLlmProvider,
} from './llm/agent-llm.types';
import { sanitizeSafeToolCalls } from './llm/parse-llm-decision';

export interface AgentChatResult {
  sessionId: string;
  reply: string;
  language: string;
  intent: string;
  questions: string[];
  executedSafeTools: string[];
  proposed: boolean;
  executed: false;
  actionIds: string[];
  provider: string;
  ollamaStatus?: string;
  ollamaHost?: string;
  ollamaModel?: string;
  projectStateUsed: true;
}

@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger('AgentOrchestrator');

  constructor(
    private readonly agentService: AgentService,
    @Inject(AGENT_LLM_PROVIDER) private readonly llm: AgentLlmProvider,
  ) {}

  async chat(
    sessionId: string,
    userId: string,
    message: string,
    ip = 'unknown',
    userAgent = 'unknown',
  ): Promise<AgentChatResult> {
    const session = await agentDb(prisma).agentSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 40 } },
    });
    if (!session) {
      throw new NotFoundException(`The requested Agent session with ID [${sessionId}] was not found.`);
    }

    const repoRoot = findRepoRoot();
    const projectState = readProjectState(repoRoot);
    const specCatalog = listApprovedProjectSpecs(repoRoot)
      .map((item) => `${item.path} (${item.exists ? 'VERIFIED present' : 'MISSING'})`)
      .join(', ');
    const history = ((session.messages as Array<{ role?: unknown; content?: unknown }>) || []).map((row) => ({
      role: String(row.role || 'user').toLowerCase() as AgentLlmMessage['role'],
      content: String(row.content || ''),
    }));
    const messages: AgentLlmMessage[] = [
      ...history.filter((row) => ['user', 'assistant', 'tool', 'system'].includes(row.role)),
      { role: 'user', content: message.slice(0, 4000) },
    ];

    const decision = await this.llm.complete({
      messages,
      projectStateExcerpt: `${projectState.content.slice(0, 18_000)}\n\nAPPROVED_SPECS (read_project_spec only): ${specCatalog}`,
      allowlistedSafeTools: ALLOWLISTED_SAFE_TOOLS,
    });

    await agentDb(prisma).agentMessage.create({
      data: { sessionId, role: 'USER', content: message.slice(0, 4000) },
    });

    const actionIds: string[] = [];
    const executedSafeTools: string[] = [];
    const allowedCalls = sanitizeSafeToolCalls(decision.safeTools);
    for (const call of allowedCalls) {
      const result = await this.agentService.invokeSafeTool(
        sessionId,
        userId,
        call.tool,
        call.args,
        ip,
        userAgent,
      );
      actionIds.push(result.actionId);
      if (result.status === 'EXECUTED') {
        executedSafeTools.push(call.tool);
      }
    }

    let proposed = false;
    if (decision.propose || decision.intent === 'plan') {
      const proposal = await this.agentService.invokeTool(
        sessionId,
        userId,
        'propose_plan',
        {
          request: message.slice(0, 1000),
          summary: decision.plan?.summary || decision.reply.slice(0, 500),
          objective: decision.plan?.objective || decision.plan?.summary || decision.reply.slice(0, 500),
          steps: decision.plan?.steps ?? [],
          intendedChanges: decision.plan?.intendedChanges ?? decision.plan?.steps ?? [],
          verificationSteps: decision.plan?.verificationSteps ?? [],
          riskLevel: decision.plan?.riskLevel ?? 'medium',
          risks: decision.plan?.risks ?? [],
          filesAffected: decision.plan?.affectedAreas ?? [],
          affectedAreas: decision.plan?.affectedAreas ?? [],
          missingInformation: decision.plan?.missingInformation ?? [],
          source: 'slice-4-orchestrator',
        },
        ip,
        userAgent,
      );
      actionIds.push(proposal.actionId);
      proposed = true;
    }

    const assistant = this.formatAssistantMessage(decision, executedSafeTools, proposed);
    await agentDb(prisma).agentMessage.create({
      data: { sessionId, role: 'ASSISTANT', content: assistant.slice(0, 8000) },
    });

    const providerUsed = decision.providerUsed || 'heuristic';
    this.logger.log(`Agent chat intent=${decision.intent} propose=${proposed} provider=${providerUsed} ollama=${decision.ollamaStatus || 'HEURISTIC_FALLBACK'}`);
    return {
      sessionId,
      reply: assistant,
      language: decision.language,
      intent: decision.intent,
      questions: decision.questions,
      executedSafeTools,
      proposed,
      executed: false,
      actionIds,
      provider: providerUsed,
      ollamaStatus: decision.ollamaStatus || 'HEURISTIC_FALLBACK',
      ollamaHost: decision.ollamaHost,
      ollamaModel: decision.ollamaModel,
      projectStateUsed: true,
    };
  }

  private formatAssistantMessage(
    decision: AgentLlmDecision,
    executedSafeTools: string[],
    proposed: boolean,
  ): string {
    const parts = [decision.reply.trim()];
    if (decision.questions.length > 0) {
      parts.push(decision.questions.map((question, index) => `${index + 1}. ${question}`).join('\n'));
    }
    if (decision.plan && proposed) {
      parts.push(
        [
          `Plan: ${decision.plan.summary}`,
          decision.plan.steps.length ? `Steps: ${decision.plan.steps.join(' | ')}` : '',
          decision.plan.risks.length ? `Risks: ${decision.plan.risks.join(' | ')}` : '',
          decision.plan.affectedAreas.length ? `Affected: ${decision.plan.affectedAreas.join(', ')}` : '',
          decision.plan.missingInformation.length
            ? `Missing: ${decision.plan.missingInformation.join(' | ')}`
            : '',
          'Status: PROPOSED (not executed).',
        ].filter(Boolean).join('\n'),
      );
    }
    if (executedSafeTools.length > 0) {
      parts.push(`SAFE tools executed: ${executedSafeTools.join(', ')}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }
}
