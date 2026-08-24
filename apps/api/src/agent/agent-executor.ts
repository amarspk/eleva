import * as fs from 'fs';
import * as path from 'path';
import { assertSafeRelativePath, findRepoRoot, gitStatus, isDeniedRepoPath, readProjectState } from './agent-tools';

export const CONTROLLED_AGENT_TOOLS = ['write_agent_note'] as const;
export type ControlledAgentTool = (typeof CONTROLLED_AGENT_TOOLS)[number];

export const AGENT_NOTE_DIR = 'docs/agent-workspace';
const MAX_BODY_CHARS = 8000;
const FILENAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface ControlledExecutionRequest {
  tool: string;
  args: Record<string, unknown>;
  approvedPlan?: Record<string, unknown>;
}

export interface ControlledExecutionResult {
  kind: 'write_agent_note';
  ran: boolean;
  path: string;
  bytes: number;
}

export interface ControlledVerificationResult {
  passed: boolean;
  projectModified: boolean;
  checks: string[];
  error?: string;
  path?: string;
}

export function isControlledAgentTool(tool: string): boolean {
  return (CONTROLLED_AGENT_TOOLS as readonly string[]).includes(tool);
}

export function parseAgentNoteInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('write_agent_note requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  const body = String(args.body ?? args.content ?? '');
  if (!body.trim() || body.includes('\0') || body.length > MAX_BODY_CHARS) {
    throw new Error(`write_agent_note body must be 1–${MAX_BODY_CHARS} characters and must not contain NUL.`);
  }
  const relativePath = `${AGENT_NOTE_DIR}/${filename}.md`;
  return { filename, body, relativePath };
}

export function assertAgentNotePath(relativePath: string, repoRoot: string): string {
  const safe = assertSafeRelativePath(relativePath);
  if (isDeniedRepoPath(safe)) {
    throw new Error(`Access denied: path [${safe}] is not writable by the Agent.`);
  }
  if (!safe.startsWith(`${AGENT_NOTE_DIR}/`) || !safe.endsWith('.md')) {
    throw new Error(`write_agent_note may only write markdown under ${AGENT_NOTE_DIR}/.`);
  }
  if (safe.includes('..') || path.isAbsolute(safe)) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }
  const absolute = path.resolve(repoRoot, safe);
  const rootResolved = path.resolve(repoRoot);
  const workspace = path.resolve(repoRoot, AGENT_NOTE_DIR);
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    throw new Error('Access denied: path escapes the repository root.');
  }
  if (!absolute.startsWith(workspace + path.sep)) {
    throw new Error('Access denied: path is outside the Agent workspace.');
  }
  return absolute;
}

export function assertPlanMatchesWrite(request: ControlledExecutionRequest, relativePath: string): void {
  if (request.tool !== 'write_agent_note') {
    throw new Error(`Unsupported controlled operation [${request.tool}].`);
  }
  const plan = request.approvedPlan ?? {};
  const files = Array.isArray(plan.filesAffected)
    ? plan.filesAffected.map((item) => String(item))
    : [];
  if (files.length > 0 && !files.includes(relativePath)) {
    throw new Error('Approved plan does not match the operation being executed.');
  }
}

export class ControlledAgentExecutor {
  constructor(private readonly repoRoot: string = findRepoRoot()) {}

  validate(request: ControlledExecutionRequest): { filename: string; body: string; relativePath: string; absolutePath: string } {
    if (!isControlledAgentTool(request.tool)) {
      throw new Error(`Operation [${request.tool}] is not allow-listed for controlled execution.`);
    }
    const parsed = parseAgentNoteInput(request.args);
    assertPlanMatchesWrite(request, parsed.relativePath);
    const absolutePath = assertAgentNotePath(parsed.relativePath, this.repoRoot);
    return { ...parsed, absolutePath };
  }

  execute(request: ControlledExecutionRequest): ControlledExecutionResult {
    const validated = this.validate(request);
    const workspace = path.join(this.repoRoot, AGENT_NOTE_DIR);
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(validated.absolutePath, validated.body, { encoding: 'utf8', flag: 'w' });
    return {
      kind: 'write_agent_note',
      ran: true,
      path: validated.relativePath,
      bytes: Buffer.byteLength(validated.body),
    };
  }

  verify(request: ControlledExecutionRequest, execution: ControlledExecutionResult): ControlledVerificationResult {
    const checks = ['path-in-workspace', 'content-match', 'read_project_state', 'git_status'];
    try {
      const validated = this.validate(request);
      if (execution.path !== validated.relativePath || !fs.existsSync(validated.absolutePath)) {
        return { passed: false, projectModified: false, checks, error: 'Written note was not found.', path: validated.relativePath };
      }
      const onDisk = fs.readFileSync(validated.absolutePath, 'utf8');
      if (onDisk !== validated.body) {
        return { passed: false, projectModified: true, checks, error: 'Written note did not match the approved body.', path: validated.relativePath };
      }
      readProjectState(this.repoRoot);
      gitStatus(this.repoRoot);
      return {
        passed: true,
        projectModified: true,
        checks,
        path: validated.relativePath,
      };
    } catch (error) {
      return {
        passed: false,
        projectModified: false,
        checks,
        error: (error as Error).message,
      };
    }
  }
}
