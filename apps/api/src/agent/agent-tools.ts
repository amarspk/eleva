import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const SAFE_AGENT_TOOLS = [
  'read_project_state',
  'read_repo_file',
  'git_status',
  'git_log',
  'read_project_spec',
  'read_project_memory',
  'remember_project_memory',
] as const;
export type SafeAgentTool = (typeof SAFE_AGENT_TOOLS)[number];

/** Slice 2 planning tool — persists a PROPOSED action only. */
export const PLAN_AGENT_TOOLS = ['propose_plan'] as const;
export type PlanAgentTool = (typeof PLAN_AGENT_TOOLS)[number];

/**
 * Sensitive tools remain disabled in Slice 2. Invoking them records a
 * PROPOSED AgentAction and never executes the named operation — even after approval.
 */
export const SENSITIVE_AGENT_TOOLS = [
  'apply_patch',
  'deploy',
  'run_migration',
  'change_secrets',
  'stripe_action',
  'sendgrid_send',
  'backup_restore',
  'delete_tenant',
  'delete_user',
  'change_rbac',
  'stop_service',
] as const;
export type SensitiveAgentTool = (typeof SENSITIVE_AGENT_TOOLS)[number];

export const INVOCABLE_AGENT_TOOLS = [
  ...SAFE_AGENT_TOOLS,
  ...PLAN_AGENT_TOOLS,
  ...SENSITIVE_AGENT_TOOLS,
  'write_agent_note',
  'write_implementation_file',
  'verify_implementation_file',
  'analyze_implementation_file',
  'apply_approved_implementation',
  'apply_approved_product_implementation',
] as const;

const DENY_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.example',
  '.git-credentials',
  '.netrc',
  '.npmrc',
]);

const DENY_RELATIVE = new Set([
  '.git/config',
  '.git/credentials',
  'k8s/secrets.yml',
]);

export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'PROJECT_STATE.md')) && fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('ELEVA repository root (PROJECT_STATE.md) could not be resolved.');
}

export function isDeniedRepoPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const base = path.posix.basename(normalized).toLowerCase();
  if (DENY_BASENAMES.has(base) || base.startsWith('.env')) {
    return true;
  }
  if (DENY_RELATIVE.has(normalized)) {
    return true;
  }
  if (normalized.startsWith('.git/')) {
    return true;
  }
  if (/(^|\/)(secrets?|credentials?|id_rsa|id_ed25519)(\.|\/|$)/i.test(normalized)) {
    return true;
  }
  if (/\.(pem|key|p12|pfx)$/i.test(normalized)) {
    return true;
  }
  return false;
}

export function assertSafeRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new Error('A repository-relative file path is required.');
  }
  if (path.isAbsolute(trimmed) || trimmed.split(/[/\\]/).includes('..')) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }
  const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  if (isDeniedRepoPath(normalized)) {
    throw new Error(`Access denied: path [${normalized}] is not readable by the Agent.`);
  }
  return normalized;
}

export function readProjectState(repoRoot: string): { path: string; content: string; bytes: number } {
  const filePath = path.join(repoRoot, 'PROJECT_STATE.md');
  const content = fs.readFileSync(filePath, 'utf8');
  return { path: 'PROJECT_STATE.md', content, bytes: Buffer.byteLength(content) };
}

export function readRepoFile(repoRoot: string, relativePath: string): { path: string; content: string; bytes: number } {
  const safe = assertSafeRelativePath(relativePath);
  const absolute = path.resolve(repoRoot, safe);
  const rootResolved = path.resolve(repoRoot);
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    throw new Error('Access denied: path escapes the repository root.');
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`File [${safe}] was not found.`);
  }
  const content = fs.readFileSync(absolute, 'utf8');
  const max = 200_000;
  if (content.length > max) {
    return { path: safe, content: content.slice(0, max), bytes: Buffer.byteLength(content) };
  }
  return { path: safe, content, bytes: Buffer.byteLength(content) };
}

function runGit(repoRoot: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 10_000 });
  if (result.error) {
    throw new Error(`git ${args[0]} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(result.stderr || result.stdout || 'unknown error').trim()}`);
  }
  return (result.stdout || '').trimEnd();
}

export function gitStatus(repoRoot: string): { output: string } {
  return { output: runGit(repoRoot, ['status', '--porcelain=v1', '-b']) };
}

export function gitLog(repoRoot: string, limit = 10): { output: string } {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 30);
  return { output: runGit(repoRoot, ['log', `-${take}`, '--oneline', '--decorate']) };
}

/**
 * Official specification/context files verified present at repo root
 * (PROJECT_STATE.md §2 + AGENT_BUILD_ROADMAP.md). Not source code.
 */
export const APPROVED_PROJECT_SPECS = [
  { id: 'project-state', path: 'PROJECT_STATE.md', title: 'PROJECT STATE' },
  { id: 'agent-build-roadmap', path: 'AGENT_BUILD_ROADMAP.md', title: 'ELEVA Agent construction roadmap' },
  { id: 'spec-index', path: 'SPEC_INDEX.md', title: 'Specification index' },
  { id: 'doc-001', path: 'DOC-001.md', title: 'System architecture' },
  { id: 'doc-002', path: 'DOC-002.md', title: 'Database schema specification' },
  { id: 'doc-003', path: 'DOC-003.md', title: 'REST API specification' },
  { id: 'doc-004', path: 'DOC-004.md', title: 'Technical specification DOC-004' },
  { id: 'doc-005', path: 'DOC-005.md', title: 'Business logic and workflows' },
  { id: 'doc-006', path: 'DOC-006.md', title: 'Security implementation specification' },
  { id: 'doc-007', path: 'DOC-007.md', title: 'Image storage and processing' },
  { id: 'doc-008', path: 'DOC-008.md', title: 'Notifications system architecture' },
  { id: 'doc-009', path: 'DOC-009.md', title: 'Third-party integrations' },
  { id: 'doc-010', path: 'DOC-010.md', title: 'Performance and scaling' },
  { id: 'implementation-roadmap', path: 'IMPLEMENTATION_ROADMAP.md', title: 'Implementation roadmap' },
  { id: 'tsk-0006', path: 'TSK-0006_HEALTH_CHECK.md', title: 'TSK-0006 repository health check' },
] as const;

export type ApprovedProjectSpec = (typeof APPROVED_PROJECT_SPECS)[number];
export type SpecContextStatus = 'VERIFIED' | 'MISSING' | 'UNKNOWN' | 'DENIED' | 'LIST';

export interface SpecContextFact {
  text: string;
  sourcePath: string | null;
  status: 'VERIFIED' | 'MISSING' | 'UNKNOWN';
}

export interface ProjectSpecResult {
  tool: 'read_project_spec';
  requested: string | null;
  listed: boolean;
  sourcePath: string | null;
  available: Array<{ id: string; path: string; title: string; exists: boolean; status: 'VERIFIED' | 'MISSING' }>;
  content: string | null;
  relevantSections: string[];
  verifiedFacts: SpecContextFact[];
  missingInformation: SpecContextFact[];
  unknownInformation: SpecContextFact[];
  specificationVersion: string | null;
  bytes: number;
  status: SpecContextStatus;
  error?: string;
}

const SPEC_MAX_CHARS = 80_000;

function emptySpecResult(partial: Partial<ProjectSpecResult>): ProjectSpecResult {
  return {
    tool: 'read_project_spec',
    requested: null,
    listed: false,
    sourcePath: null,
    available: [],
    content: null,
    relevantSections: [],
    verifiedFacts: [],
    missingInformation: [],
    unknownInformation: [],
    specificationVersion: null,
    bytes: 0,
    status: 'UNKNOWN',
    ...partial,
  };
}

export function listApprovedProjectSpecs(repoRoot: string): ProjectSpecResult['available'] {
  return APPROVED_PROJECT_SPECS.map((spec) => {
    const absolute = path.join(repoRoot, spec.path);
    const exists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    return {
      id: spec.id,
      path: spec.path,
      title: spec.title,
      exists,
      status: exists ? 'VERIFIED' as const : 'MISSING' as const,
    };
  });
}

export function resolveApprovedSpec(request: string): ApprovedProjectSpec | undefined {
  const raw = request.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const lower = raw.toLowerCase();
  const stem = lower.replace(/\.md$/i, '');
  return APPROVED_PROJECT_SPECS.find((spec) => {
    const specStem = spec.path.toLowerCase().replace(/\.md$/i, '');
    return spec.path.toLowerCase() === lower
      || spec.id === stem
      || specStem === stem
      || spec.title.toLowerCase() === lower;
  });
}

function extractSpecVersion(content: string): string | null {
  const patterns = [
    /Document Version:\s*([^\n]+)/i,
    /Generated:\s*([^\n]+)/i,
    /\*\*Date:\*\*\s*([^\n]+)/i,
    /\*\*HEAD at last roadmap update:\*\*\s*`?([a-f0-9]{7,40})`?/i,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim().slice(0, 200);
    }
  }
  return null;
}

function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => /^#{1,3}\s+\S/.test(line))
    .map((line) => line.replace(/^#+\s+/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}

export function readProjectSpec(repoRoot: string, args: Record<string, unknown> = {}): ProjectSpecResult {
  const available = listApprovedProjectSpecs(repoRoot);
  const rawRequest = args.spec ?? args.path ?? args.name ?? args.filename ?? args.document ?? '';
  const requested = rawRequest === undefined || rawRequest === null ? '' : String(rawRequest).trim();
  const listRequested = args.list === true
    || requested === ''
    || requested.toLowerCase() === 'list'
    || requested.toLowerCase() === 'catalog';

  if (listRequested) {
    const missing = available.filter((item) => !item.exists);
    return emptySpecResult({
      requested: requested || null,
      listed: true,
      available,
      status: 'LIST',
      verifiedFacts: available.filter((item) => item.exists).map((item) => ({
        text: `Approved specification [${item.path}] is present.`,
        sourcePath: item.path,
        status: 'VERIFIED',
      })),
      missingInformation: missing.map((item) => ({
        text: `Approved specification [${item.path}] is not on disk.`,
        sourcePath: item.path,
        status: 'MISSING',
      })),
    });
  }

  if (path.isAbsolute(requested) || requested.split(/[/\\]/).includes('..') || requested.includes('\0')) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }

  const normalized = requested.replace(/\\/g, '/').replace(/^\/+/, '');
  if (isDeniedRepoPath(normalized) || /(^|\/)\.env/i.test(normalized)) {
    throw new Error(`Access denied: path [${normalized}] is not readable by the Agent.`);
  }

  const resolved = resolveApprovedSpec(requested);
  if (!resolved) {
    throw new Error(`Specification [${requested}] is not on the approved specification allow-list.`);
  }

  const absolute = path.resolve(repoRoot, resolved.path);
  const rootResolved = path.resolve(repoRoot);
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    throw new Error('Access denied: path escapes the repository root.');
  }

  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return emptySpecResult({
      requested,
      listed: false,
      sourcePath: resolved.path,
      available,
      status: 'MISSING',
      missingInformation: [{
        text: `Approved specification [${resolved.path}] was not found on disk.`,
        sourcePath: resolved.path,
        status: 'MISSING',
      }],
      unknownInformation: [{
        text: 'Contents of the missing specification are UNKNOWN and must not be invented.',
        sourcePath: resolved.path,
        status: 'UNKNOWN',
      }],
      error: `Specification [${resolved.path}] was not found.`,
    });
  }

  const raw = fs.readFileSync(absolute, 'utf8');
  const content = raw.length > SPEC_MAX_CHARS ? raw.slice(0, SPEC_MAX_CHARS) : raw;
  const headings = extractHeadings(content);
  return emptySpecResult({
    requested,
    listed: false,
    sourcePath: resolved.path,
    available,
    content,
    relevantSections: headings,
    verifiedFacts: [
      {
        text: `Read ${resolved.path} (${resolved.title}).`,
        sourcePath: resolved.path,
        status: 'VERIFIED',
      },
      ...headings.slice(0, 8).map((heading) => ({
        text: `Section present: ${heading}`,
        sourcePath: resolved.path,
        status: 'VERIFIED' as const,
      })),
    ],
    missingInformation: [],
    unknownInformation: [{
      text: 'Requirements not present in the returned excerpt are UNKNOWN and must not be invented.',
      sourcePath: resolved.path,
      status: 'UNKNOWN',
    }],
    specificationVersion: extractSpecVersion(content),
    bytes: Buffer.byteLength(content),
    status: 'VERIFIED',
  });
}
