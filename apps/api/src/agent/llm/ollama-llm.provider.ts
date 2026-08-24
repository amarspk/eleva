import { Injectable, Logger } from '@nestjs/common';
import { extractJsonObject, parseLlmDecision } from './parse-llm-decision';
import type { AgentLlmCompleteInput, AgentLlmDecision, AgentLlmProvider } from './agent-llm.types';
import { HeuristicLlmProvider } from './heuristic-llm.provider';

const SYSTEM_PROMPT = `You are the ELEVA platform-owner Agent planner (Slice 3).
Rules:
- PROJECT_STATE.md is the only project source of truth. Never invent files, APIs, audits, permissions, or requirements.
- Reply in the user's language (Arabic, English, or mixed).
- If required fields are missing, set intent=clarify and ask questions. Do not guess.
- Agent V1 cannot read restaurant, order, or customer data.
- You MUST NOT execute anything. You only return JSON.
- safeTools may only include: read_project_state, read_repo_file, git_status, git_log.
- Never put apply_patch, deploy, migrate, stripe, sendgrid, or secret tools in safeTools.
- For code/product changes set propose=true and fill plan {summary,steps,risks,affectedAreas,missingInformation}.
Return ONLY JSON:
{"language":"ar|en|mixed","intent":"clarify|inspect|plan|refuse","reply":"...","questions":[],"safeTools":[{"tool":"read_project_state","args":{}}],"propose":false,"plan":null}`;

/** Local Ollama defaults. Overridden by OLLAMA_HOST / OLLAMA_MODEL. Not secrets. */
export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';

export function resolveOllamaConfig(
  env: NodeJS.ProcessEnv = process.env,
): { host: string; model: string } {
  const host = String(env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST).trim().replace(/\/$/, '');
  const model = String(env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL).trim();
  return {
    host: host || DEFAULT_OLLAMA_HOST,
    model: model || DEFAULT_OLLAMA_MODEL,
  };
}

@Injectable()
export class OllamaLlmProvider implements AgentLlmProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger('OllamaLlmProvider');
  private readonly fallback = new HeuristicLlmProvider();

  async complete(input: AgentLlmCompleteInput): Promise<AgentLlmDecision> {
    const { host, model } = resolveOllamaConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `PROJECT_STATE excerpt:\n${input.projectStateExcerpt.slice(0, 12_000)}\n\nConversation:\n${
                input.messages.map((message) => `${message.role}: ${message.content}`).join('\n').slice(0, 8_000)
              }`,
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}`);
      }
      const payload = await response.json() as { message?: { content?: string } };
      const parsed = parseLlmDecision(extractJsonObject(String(payload.message?.content ?? '')));
      if (!parsed.reply) {
        throw new Error('Ollama returned empty reply');
      }
      return parsed;
    } catch (error) {
      this.logger.warn(`Ollama unavailable (${(error as Error).message}); using heuristic planner.`);
      return this.fallback.complete(input);
    } finally {
      clearTimeout(timer);
    }
  }
}
