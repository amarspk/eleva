import { SAFE_AGENT_TOOLS, SENSITIVE_AGENT_TOOLS, PLAN_AGENT_TOOLS } from '../agent-tools';

export const AGENT_LLM_PROVIDER = 'AGENT_LLM_PROVIDER';

export type AgentReplyLanguage = 'ar' | 'en' | 'mixed';
export type AgentIntent = 'clarify' | 'inspect' | 'plan' | 'refuse';

export interface AgentLlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AgentLlmToolCall {
  tool: string;
  args?: Record<string, unknown>;
}

export interface AgentStructuredPlan {
  summary: string;
  steps: string[];
  risks: string[];
  affectedAreas: string[];
  missingInformation: string[];
  objective?: string;
  intendedChanges?: string[];
  verificationSteps?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export type AgentLlmProviderName = 'ollama' | 'heuristic';
export type OllamaRuntimeStatus =
  | 'OLLAMA_AVAILABLE'
  | 'OLLAMA_UNAVAILABLE'
  | 'OLLAMA_REQUEST_FAILED'
  | 'OLLAMA_MODEL_MISSING'
  | 'HEURISTIC_FALLBACK';

export interface AgentLlmDecision {
  language: AgentReplyLanguage;
  intent: AgentIntent;
  reply: string;
  questions: string[];
  safeTools: AgentLlmToolCall[];
  propose: boolean;
  plan?: AgentStructuredPlan;
  /** Which planner actually produced this decision. Never spoofed from model JSON. */
  providerUsed?: AgentLlmProviderName;
  ollamaStatus?: OllamaRuntimeStatus;
  ollamaHost?: string;
  ollamaModel?: string;
  ollamaError?: string;
}

export interface AgentLlmCompleteInput {
  messages: AgentLlmMessage[];
  projectStateExcerpt: string;
  allowlistedSafeTools: readonly string[];
}

export interface AgentLlmProvider {
  readonly name: string;
  complete(input: AgentLlmCompleteInput): Promise<AgentLlmDecision>;
}

export const ALLOWLISTED_SAFE_TOOLS: readonly string[] = [...SAFE_AGENT_TOOLS];
export const BLOCKED_EXECUTION_TOOLS: readonly string[] = [
  ...SENSITIVE_AGENT_TOOLS,
  ...PLAN_AGENT_TOOLS,
];

export function emptyDecision(partial: Partial<AgentLlmDecision> = {}): AgentLlmDecision {
  return {
    language: 'en',
    intent: 'refuse',
    reply: '',
    questions: [],
    safeTools: [],
    propose: false,
    ...partial,
  };
}
