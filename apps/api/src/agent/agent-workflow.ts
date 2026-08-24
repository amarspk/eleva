import { SENSITIVE_AGENT_TOOLS } from './agent-tools';

export const AGENT_WORKFLOW_STATES = [
  'PLANNING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTING',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'REJECTED',
] as const;

export type AgentWorkflowState = (typeof AGENT_WORKFLOW_STATES)[number];
export type AgentRiskLevel = 'low' | 'medium' | 'high';

export interface AgentStructuredWorkPlan {
  objective: string;
  filesAffected: string[];
  intendedChanges: string[];
  verificationSteps: string[];
  riskLevel: AgentRiskLevel;
  summary: string;
  steps: string[];
  risks: string[];
  request?: string;
}

export function deriveWorkflowState(status: string): AgentWorkflowState {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PROPOSED') {
    return 'AWAITING_APPROVAL';
  }
  if ((AGENT_WORKFLOW_STATES as readonly string[]).includes(normalized)) {
    return normalized as AgentWorkflowState;
  }
  if (normalized === 'EXECUTED') {
    return 'COMPLETED';
  }
  return 'PLANNING';
}

export function isBlockedSensitiveTool(tool: string): boolean {
  return (SENSITIVE_AGENT_TOOLS as readonly string[]).includes(tool);
}

export function normalizeRiskLevel(value: unknown): AgentRiskLevel {
  const raw = String(value || '').toLowerCase();
  if (raw === 'high' || raw === 'medium' || raw === 'low') {
    return raw;
  }
  return 'medium';
}

export function asStringList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.map((item) => String(item).slice(0, 400)).filter((item) => item.length > 0).slice(0, 20);
}

export function buildStructuredWorkPlan(
  tool: string,
  args: Record<string, unknown>,
): AgentStructuredWorkPlan {
  const summary = String(args.summary ?? args.objective ?? args.goal ?? `Proposed ${tool}`).slice(0, 500);
  const objective = String(args.objective ?? summary).slice(0, 500);
  const steps = asStringList(args.steps, [
    'Inspect PROJECT_STATE.md.',
    'Await PLATFORM_OWNER approval.',
    'Run controlled verification only after approval.',
  ]);
  const slug = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  const defaultFiles = tool === 'write_agent_note' && slug
    ? [`docs/agent-workspace/${slug}.md`]
    : (tool === 'write_implementation_file' || tool === 'verify_implementation_file') && slug
      ? [`apps/api/src/agent/implementation/${slug}.ts`]
      : [];
  const filesAffected = asStringList(args.filesAffected ?? args.affectedAreas, defaultFiles);
  const intendedChanges = asStringList(args.intendedChanges, steps);
  const verificationSteps = asStringList(args.verificationSteps, [
    'Re-read PROJECT_STATE.md.',
    'Record git status.',
    'Do not apply patches, deploy, migrate, or touch secrets.',
  ]);
  const risks = asStringList(args.risks, []);
  return {
    objective,
    filesAffected,
    intendedChanges,
    verificationSteps,
    riskLevel: isBlockedSensitiveTool(tool) ? 'high' : normalizeRiskLevel(args.riskLevel),
    summary,
    steps,
    risks,
    request: args.request ? String(args.request).slice(0, 1000) : undefined,
  };
}
