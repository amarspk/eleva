import { Injectable, Logger } from '@nestjs/common';
import { extractJsonObject, parseLlmDecision } from './parse-llm-decision';
import type {
  AgentLlmCompleteInput,
  AgentLlmDecision,
  AgentLlmProvider,
  OllamaRuntimeStatus,
} from './agent-llm.types';
import { HeuristicLlmProvider } from './heuristic-llm.provider';

const SYSTEM_PROMPT = `You are the ELEVA platform-owner Agent planner (Slice 3).
Rules:
- PROJECT_STATE.md is the primary project source of truth. Official specs may be loaded only via read_project_spec.
- Never invent files, APIs, audits, permissions, or requirements. Mark gaps VERIFIED / MISSING / UNKNOWN.
- Reply in the user's language (Arabic, English, or mixed).
- If required fields are missing, set intent=clarify and ask questions. Do not guess.
- Agent V1 cannot read restaurant, order, or customer data.
- You MUST NOT execute anything. You only return JSON.
- safeTools may only include: read_project_state, read_project_spec, read_repo_file, git_status, git_log.
- Never put apply_patch, deploy, migrate, stripe, sendgrid, or secret tools in safeTools.
- For code/product changes set propose=true and fill plan {summary,steps,risks,affectedAreas,missingInformation}.
Return ONLY JSON:
{"language":"ar|en|mixed","intent":"clarify|inspect|plan|refuse","reply":"...","questions":[],"safeTools":[{"tool":"read_project_state","args":{}}],"propose":false,"plan":null}`;

/** Local Ollama defaults. Overridden by OLLAMA_HOST / OLLAMA_MODEL. Not secrets. */
export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';
const OLLAMA_TIMEOUT_MS = 8_000;

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

export interface OllamaHealth {
  status: OllamaRuntimeStatus;
  host: string;
  model: string;
  models: string[];
  reachable: boolean;
  modelPresent: boolean;
  error?: string;
}

function modelMatches(installed: string, wanted: string): boolean {
  const a = installed.toLowerCase();
  const b = wanted.toLowerCase();
  return a === b || a.startsWith(`${b}:`) || b.startsWith(`${a}:`);
}

export async function probeOllama(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaHealth> {
  const { host, model } = resolveOllamaConfig(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${host}/api/tags`, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      return {
        status: 'OLLAMA_REQUEST_FAILED',
        host,
        model,
        models: [],
        reachable: true,
        modelPresent: false,
        error: `Ollama HTTP ${response.status} on /api/tags`,
      };
    }
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    const models = (payload.models || []).map((item) => String(item.name || '')).filter(Boolean);
    const modelPresent = models.some((name) => modelMatches(name, model));
    if (!modelPresent) {
      return {
        status: 'OLLAMA_MODEL_MISSING',
        host,
        model,
        models,
        reachable: true,
        modelPresent: false,
        error: `Configured model [${model}] was not reported by Ollama.`,
      };
    }
    return {
      status: 'OLLAMA_AVAILABLE',
      host,
      model,
      models,
      reachable: true,
      modelPresent: true,
    };
  } catch (error) {
    return {
      status: 'OLLAMA_UNAVAILABLE',
      host,
      model,
      models: [],
      reachable: false,
      modelPresent: false,
      error: (error as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function withProviderMeta(
  decision: AgentLlmDecision,
  meta: {
    providerUsed: 'ollama' | 'heuristic';
    ollamaStatus: OllamaRuntimeStatus;
    host: string;
    model: string;
    error?: string;
  },
): AgentLlmDecision {
  return {
    ...decision,
    providerUsed: meta.providerUsed,
    ollamaStatus: meta.ollamaStatus,
    ollamaHost: meta.host,
    ollamaModel: meta.model,
    ollamaError: meta.error,
  };
}

@Injectable()
export class OllamaLlmProvider implements AgentLlmProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger('OllamaLlmProvider');
  private readonly fallback = new HeuristicLlmProvider();

  async probe(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<OllamaHealth> {
    return probeOllama(env, fetchImpl);
  }

  async complete(
    input: AgentLlmCompleteInput,
    fetchImpl: typeof fetch = fetch,
  ): Promise<AgentLlmDecision> {
    const { host, model } = resolveOllamaConfig();
    const health = await probeOllama(process.env, fetchImpl);
    if (health.status !== 'OLLAMA_AVAILABLE') {
      this.logger.warn(`Ollama ${health.status} (${health.error || 'not ready'}); using heuristic planner.`);
      const fallback = await this.fallback.complete(input);
      return withProviderMeta(fallback, {
        providerUsed: 'heuristic',
        ollamaStatus: health.status,
        host,
        model,
        error: health.error,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${host}/api/chat`, {
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
      return withProviderMeta(parsed, {
        providerUsed: 'ollama',
        ollamaStatus: 'OLLAMA_AVAILABLE',
        host,
        model,
      });
    } catch (error) {
      this.logger.warn(`Ollama request failed (${(error as Error).message}); using heuristic planner.`);
      const fallback = await this.fallback.complete(input);
      return withProviderMeta(fallback, {
        providerUsed: 'heuristic',
        ollamaStatus: 'OLLAMA_REQUEST_FAILED',
        host,
        model,
        error: (error as Error).message,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
