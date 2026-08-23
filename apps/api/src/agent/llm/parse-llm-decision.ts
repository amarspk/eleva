import {
  ALLOWLISTED_SAFE_TOOLS,
  BLOCKED_EXECUTION_TOOLS,
  emptyDecision,
  type AgentIntent,
  type AgentLlmDecision,
  type AgentLlmToolCall,
  type AgentReplyLanguage,
  type AgentStructuredPlan,
} from './agent-llm.types';

const INTENTS: AgentIntent[] = ['clarify', 'inspect', 'plan', 'refuse'];
const LANGS: AgentReplyLanguage[] = ['ar', 'en', 'mixed'];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).slice(0, 400)).filter((item) => item.length > 0).slice(0, 20);
}

function parsePlan(value: unknown): AgentStructuredPlan | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    summary: asString(record.summary).slice(0, 500),
    steps: asStringArray(record.steps),
    risks: asStringArray(record.risks),
    affectedAreas: asStringArray(record.affectedAreas),
    missingInformation: asStringArray(record.missingInformation),
  };
}

function parseToolCalls(value: unknown): AgentLlmToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const calls: AgentLlmToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const tool = asString((item as { tool?: unknown }).tool).trim();
    if (!tool) {
      continue;
    }
    const args = (item as { args?: unknown }).args;
    calls.push({
      tool,
      args: args && typeof args === 'object' && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {},
    });
  }
  return calls;
}

/** Drops any tool that is not a V1 SAFE allowlisted tool. LLM cannot bypass the registry. */
export function sanitizeSafeToolCalls(calls: AgentLlmToolCall[]): AgentLlmToolCall[] {
  return calls.filter((call) => {
    if (BLOCKED_EXECUTION_TOOLS.includes(call.tool)) {
      return false;
    }
    return ALLOWLISTED_SAFE_TOOLS.includes(call.tool);
  });
}

export function parseLlmDecision(raw: unknown): AgentLlmDecision {
  if (!raw || typeof raw !== 'object') {
    return emptyDecision({ reply: 'The model returned an unusable response.', intent: 'refuse' });
  }
  const record = raw as Record<string, unknown>;
  const language = LANGS.includes(record.language as AgentReplyLanguage)
    ? record.language as AgentReplyLanguage
    : 'en';
  const intent = INTENTS.includes(record.intent as AgentIntent)
    ? record.intent as AgentIntent
    : 'refuse';
  return {
    language,
    intent,
    reply: asString(record.reply).slice(0, 8000),
    questions: asStringArray(record.questions),
    safeTools: sanitizeSafeToolCalls(parseToolCalls(record.safeTools)),
    propose: record.propose === true,
    plan: parsePlan(record.plan),
  };
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}
