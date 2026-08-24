import * as fs from 'fs';
import * as path from 'path';
import { assertSafeRelativePath, findRepoRoot, gitStatus, isDeniedRepoPath, readProjectState } from './agent-tools';

export const CONTROLLED_AGENT_TOOLS = [
  'write_agent_note',
  'write_implementation_file',
  'verify_implementation_file',
  'analyze_implementation_file',
  'apply_approved_implementation',
  'apply_approved_product_implementation',
] as const;
export type ControlledAgentTool = (typeof CONTROLLED_AGENT_TOOLS)[number];

export const AGENT_NOTE_DIR = 'docs/agent-workspace';
export const AGENT_IMPLEMENTATION_DIR = 'apps/api/src/agent/implementation';
export const SLICE9_PROMOTION_TARGET = 'apps/api/src/agent/promoted.ts';
export const SLICE9_PROMOTION_PLACEHOLDER = '/** Slice 9 promotion sink. Not imported by AgentModule. */\nexport const promotedDraft = true;\n';
export const SLICE10_PRODUCT_TARGET = 'packages/receipts/src/promoted-implementation.ts';
export const SLICE10_PRODUCT_PLACEHOLDER = '/** Slice 10 product promotion sink. Not exported by @zayjar/receipts. */\nexport const promotedProductDraft = true;\n';
const MAX_NOTE_CHARS = 8000;
const MAX_IMPL_CHARS = 12000;
const FILENAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const FORBIDDEN_IMPLEMENTATION = [
  /child_process/i,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /process\.env/,
  /fs\.(unlink|rm|rmdir|rmSync|rmdirSync)/,
  /spawnSync|execSync|execFileSync/,
  /apply_patch/,
  /k8s\/secrets/i,
  /\.pem\b/,
];

export interface ControlledExecutionRequest {
  tool: string;
  args: Record<string, unknown>;
  approvedPlan?: Record<string, unknown>;
}

export interface ControlledExecutionResult {
  kind: ControlledAgentTool;
  ran: boolean;
  path: string;
  bytes: number;
  inspection?: ControlledVerificationResult;
}

export interface ControlledVerificationResult {
  passed: boolean;
  failed: boolean;
  file: string;
  projectModified: boolean;
  checks: string[];
  error?: string;
  path?: string;
  purpose?: string;
  exportsDetected?: string[];
  importsDetected?: string[];
  implementationSummary?: string;
  dependenciesDetected?: string[];
  risks?: string[];
  suggestedNextStep?: string;
  verificationRequirements?: string[];
}

export interface ParsedControlledWrite {
  tool: ControlledAgentTool;
  filename: string;
  body: string;
  relativePath: string;
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
  if (!body.trim() || body.includes('\0') || body.length > MAX_NOTE_CHARS) {
    throw new Error(`write_agent_note body must be 1–${MAX_NOTE_CHARS} characters and must not contain NUL.`);
  }
  const relativePath = `${AGENT_NOTE_DIR}/${filename}.md`;
  return { filename, body, relativePath };
}

export function parseImplementationInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('write_implementation_file requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  const body = String(args.body ?? args.content ?? '');
  if (!body.trim() || body.includes('\0') || body.length > MAX_IMPL_CHARS) {
    throw new Error(`write_implementation_file body must be 1–${MAX_IMPL_CHARS} characters and must not contain NUL.`);
  }
  if (!/\bexport\b/.test(body)) {
    throw new Error('write_implementation_file body must include an export (TypeScript module draft).');
  }
  const hit = FORBIDDEN_IMPLEMENTATION.find((pattern) => pattern.test(body));
  if (hit) {
    throw new Error(`write_implementation_file body contains a forbidden implementation pattern (${hit}).`);
  }
  const relativePath = `${AGENT_IMPLEMENTATION_DIR}/${filename}.ts`;
  return { filename, body, relativePath };
}

export function parseControlledWrite(tool: string, args: Record<string, unknown>): ParsedControlledWrite {
  if (tool === 'write_agent_note') {
    return { tool, ...parseAgentNoteInput(args) };
  }
  if (tool === 'write_implementation_file') {
    return { tool, ...parseImplementationInput(args) };
  }
  if (tool === 'verify_implementation_file') {
    return { tool, ...parseVerifyImplementationInput(args) };
  }
  if (tool === 'analyze_implementation_file') {
    return { tool, ...parseAnalyzeImplementationInput(args) };
  }
  if (tool === 'apply_approved_implementation') {
    return { tool, ...parseApplyApprovedImplementationInput(args) };
  }
  if (tool === 'apply_approved_product_implementation') {
    return { tool, ...parseApplyApprovedProductImplementationInput(args) };
  }
  throw new Error(`Operation [${tool}] is not allow-listed for controlled execution.`);
}

export function parseVerifyImplementationInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('verify_implementation_file requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  const relativePath = `${AGENT_IMPLEMENTATION_DIR}/${filename}.ts`;
  return { filename, body: '', relativePath };
}

export function inspectImplementationFile(repoRoot: string, filenameOrPath: string): ControlledVerificationResult {
  const checks = ['exists', 'sandbox-path', 'typescript', 'export', 'forbidden-ops'];
  const filename = filenameOrPath.replace(/\.ts$/i, '').split('/').pop() || '';
  const relativePath = `${AGENT_IMPLEMENTATION_DIR}/${filename}.ts`;
  try {
    if (!FILENAME_RE.test(filename)) {
      throw new Error('verify_implementation_file requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
    }
    const absolute = assertControlledWritePath('verify_implementation_file', relativePath, repoRoot);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return {
        passed: false,
        failed: true,
        file: relativePath,
        path: relativePath,
        projectModified: false,
        checks,
        error: `Implementation draft [${relativePath}] was not found.`,
      };
    }
    if (!absolute.endsWith('.ts')) {
      return {
        passed: false,
        failed: true,
        file: relativePath,
        path: relativePath,
        projectModified: false,
        checks,
        error: 'Implementation draft must be a TypeScript file.',
      };
    }
    const body = fs.readFileSync(absolute, 'utf8');
    if (!/\bexport\b/.test(body)) {
      return {
        passed: false,
        failed: true,
        file: relativePath,
        path: relativePath,
        projectModified: false,
        checks,
        error: 'Implementation draft must include an export.',
      };
    }
    const hit = FORBIDDEN_IMPLEMENTATION.find((pattern) => pattern.test(body));
    if (hit) {
      return {
        passed: false,
        failed: true,
        file: relativePath,
        path: relativePath,
        projectModified: false,
        checks,
        error: `Implementation draft contains a forbidden operation (${hit}).`,
      };
    }
    return {
      passed: true,
      failed: false,
      file: relativePath,
      path: relativePath,
      projectModified: false,
      checks,
    };
  } catch (error) {
    return {
      passed: false,
      failed: true,
      file: relativePath,
      path: relativePath,
      projectModified: false,
      checks,
      error: (error as Error).message,
    };
  }
}

function allowedDirectory(tool: ControlledAgentTool): string {
  if (tool === 'write_agent_note') {
    return AGENT_NOTE_DIR;
  }
  if (tool === 'apply_approved_implementation') {
    return path.posix.dirname(SLICE9_PROMOTION_TARGET);
  }
  if (tool === 'apply_approved_product_implementation') {
    return path.posix.dirname(SLICE10_PRODUCT_TARGET);
  }
  return AGENT_IMPLEMENTATION_DIR;
}

function allowedExtension(tool: ControlledAgentTool): string {
  return tool === 'write_agent_note' ? '.md' : '.ts';
}

function isInspectOnly(tool: string): boolean {
  return tool === 'verify_implementation_file' || tool === 'analyze_implementation_file';
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item.length > 0))).sort();
}

export function parseApplyApprovedImplementationInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('apply_approved_implementation requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  const requestedTarget = args.target === undefined || args.target === null || args.target === ''
    ? SLICE9_PROMOTION_TARGET
    : String(args.target).trim().replace(/\\/g, '/');
  if (path.isAbsolute(requestedTarget) || requestedTarget.split('/').includes('..')) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }
  if (requestedTarget !== SLICE9_PROMOTION_TARGET) {
    throw new Error(`Target [${requestedTarget}] is not the Slice 9 allow-listed path.`);
  }
  return { filename, body: '', relativePath: SLICE9_PROMOTION_TARGET };
}

export function parseApplyApprovedProductImplementationInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('apply_approved_product_implementation requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  const requestedTarget = args.target === undefined || args.target === null || args.target === ''
    ? SLICE10_PRODUCT_TARGET
    : String(args.target).trim().replace(/\\/g, '/');
  if (path.isAbsolute(requestedTarget) || requestedTarget.split('/').includes('..')) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }
  if (requestedTarget !== SLICE10_PRODUCT_TARGET) {
    throw new Error(`Target [${requestedTarget}] is not the Slice 10 allow-listed product path.`);
  }
  return { filename, body: '', relativePath: SLICE10_PRODUCT_TARGET };
}

export function parseAnalyzeImplementationInput(args: Record<string, unknown>): { filename: string; body: string; relativePath: string } {
  const filename = String(args.filename ?? args.name ?? '').trim().toLowerCase();
  if (!FILENAME_RE.test(filename)) {
    throw new Error('analyze_implementation_file requires filename matching [a-z0-9][a-z0-9-]{0,62}.');
  }
  return { filename, body: '', relativePath: `${AGENT_IMPLEMENTATION_DIR}/${filename}.ts` };
}

export function detectImplementationExports(body: string): string[] {
  const names: string[] = [];
  const named = /export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match = named.exec(body);
  while (match) {
    names.push(match[1]);
    match = named.exec(body);
  }
  const braced = /export\s*\{([^}]+)\}/g;
  let group = braced.exec(body);
  while (group) {
    group[1].split(',').forEach((part) => {
      const alias = part.trim().split(/\s+as\s+/).pop();
      if (alias) {
        names.push(alias.trim());
      }
    });
    group = braced.exec(body);
  }
  if (/\bexport\s+default\b/.test(body)) {
    names.push('default');
  }
  return uniqueSorted(names);
}

export function detectImplementationImports(body: string): string[] {
  const specs: string[] = [];
  const from = /(?:import|export)\s[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  let match = from.exec(body);
  while (match) {
    specs.push(match[1]);
    match = from.exec(body);
  }
  const side = /import\s+['"]([^'"]+)['"]/g;
  let bare = side.exec(body);
  while (bare) {
    specs.push(bare[1]);
    bare = side.exec(body);
  }
  return uniqueSorted(specs);
}

export function analyzeImplementationFile(repoRoot: string, filenameOrPath: string): ControlledVerificationResult {
  const inspection = inspectImplementationFile(repoRoot, filenameOrPath);
  const checks = [...inspection.checks, 'structured-analysis'];
  if (!inspection.passed) {
    return { ...inspection, checks };
  }
  const filename = filenameOrPath.replace(/\.ts$/i, '').split('/').pop() || '';
  const relativePath = `${AGENT_IMPLEMENTATION_DIR}/${filename}.ts`;
  const absolute = assertControlledWritePath('analyze_implementation_file', relativePath, repoRoot);
  const body = fs.readFileSync(absolute, 'utf8');
  const exportsDetected = detectImplementationExports(body);
  const importsDetected = detectImplementationImports(body);
  return {
    passed: true,
    failed: false,
    file: relativePath,
    path: relativePath,
    projectModified: false,
    checks,
    purpose: `Read-only analysis of sandbox draft ${relativePath}.`,
    exportsDetected,
    importsDetected,
    implementationSummary: `Draft exports ${exportsDetected.join(', ') || '(none)'} and imports ${importsDetected.join(', ') || '(none)'}.`,
    dependenciesDetected: importsDetected,
    risks: [
      'Draft remains sandboxed and is not imported by production Agent/runtime code.',
      'A later approved slice is required before any production path may change.',
    ],
    suggestedNextStep: 'Keep the draft sandboxed until a later approved slice applies a reviewed change to a specific production file.',
    verificationRequirements: [
      'Re-run verify_implementation_file on the same slug.',
      'Confirm the file still lives under apps/api/src/agent/implementation/.',
      'Do not apply_patch, deploy, migrate, or touch secrets.',
    ],
  };
}

export function assertControlledWritePath(tool: ControlledAgentTool, relativePath: string, repoRoot: string): string {
  const safe = assertSafeRelativePath(relativePath);
  if (isDeniedRepoPath(safe)) {
    throw new Error(`Access denied: path [${safe}] is not writable by the Agent.`);
  }
  if (tool === 'apply_approved_implementation' && safe !== SLICE9_PROMOTION_TARGET) {
    throw new Error(`apply_approved_implementation may only write the allow-listed target [${SLICE9_PROMOTION_TARGET}].`);
  }
  if (tool === 'apply_approved_product_implementation' && safe !== SLICE10_PRODUCT_TARGET) {
    throw new Error(`apply_approved_product_implementation may only write the allow-listed target [${SLICE10_PRODUCT_TARGET}].`);
  }
  const dir = allowedDirectory(tool);
  const ext = allowedExtension(tool);
  const isPromotionApply = tool === 'apply_approved_implementation' || tool === 'apply_approved_product_implementation';
  if (!isPromotionApply && (!safe.startsWith(`${dir}/`) || !safe.endsWith(ext))) {
    throw new Error(`${tool} may only write ${ext} files under ${dir}/.`);
  }
  if (safe.includes('..') || path.isAbsolute(safe)) {
    throw new Error('Absolute paths and parent-directory segments are not allowed.');
  }
  const absolute = path.resolve(repoRoot, safe);
  const rootResolved = path.resolve(repoRoot);
  const workspace = path.resolve(repoRoot, dir);
  if (absolute !== rootResolved && !absolute.startsWith(rootResolved + path.sep)) {
    throw new Error('Access denied: path escapes the repository root.');
  }
  if (!absolute.startsWith(workspace + path.sep)) {
    throw new Error('Access denied: path is outside the Agent sandbox.');
  }
  return absolute;
}

export function assertPlanMatchesWrite(request: ControlledExecutionRequest, relativePath: string): void {
  if (!isControlledAgentTool(request.tool)) {
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

  validate(request: ControlledExecutionRequest): ParsedControlledWrite & { absolutePath: string } {
    const parsed = parseControlledWrite(request.tool, request.args);
    assertPlanMatchesWrite(request, parsed.relativePath);
    if (parsed.tool === 'apply_approved_implementation' || parsed.tool === 'apply_approved_product_implementation') {
      const source = `${AGENT_IMPLEMENTATION_DIR}/${parsed.filename}.ts`;
      const plan = request.approvedPlan ?? {};
      const files = Array.isArray(plan.filesAffected) ? plan.filesAffected.map((item) => String(item)) : [];
      if (files.length > 0 && !files.includes(source)) {
        throw new Error('Approved plan does not match the operation being executed.');
      }
    }
    const absolutePath = assertControlledWritePath(parsed.tool, parsed.relativePath, this.repoRoot);
    return { ...parsed, absolutePath };
  }

  execute(request: ControlledExecutionRequest): ControlledExecutionResult {
    const validated = this.validate(request);
    if (isInspectOnly(validated.tool)) {
      const inspection = validated.tool === 'analyze_implementation_file'
        ? analyzeImplementationFile(this.repoRoot, validated.filename)
        : inspectImplementationFile(this.repoRoot, validated.filename);
      return {
        kind: validated.tool,
        ran: true,
        path: validated.relativePath,
        bytes: 0,
        inspection,
      };
    }
    if (validated.tool === 'apply_approved_implementation' || validated.tool === 'apply_approved_product_implementation') {
      const analysis = analyzeImplementationFile(this.repoRoot, validated.filename);
      if (!analysis.passed) {
        throw new Error(analysis.error || 'Implementation draft failed verify/analyze prerequisites.');
      }
      const sourceRelative = `${AGENT_IMPLEMENTATION_DIR}/${validated.filename}.ts`;
      const sourceAbsolute = assertControlledWritePath('write_implementation_file', sourceRelative, this.repoRoot);
      const body = fs.readFileSync(sourceAbsolute, 'utf8');
      fs.writeFileSync(validated.absolutePath, body, { encoding: 'utf8', flag: 'w' });
      const onDisk = fs.readFileSync(validated.absolutePath, 'utf8');
      if (onDisk !== body) {
        throw new Error('Promoted target did not match the approved draft after write.');
      }
      const target = validated.tool === 'apply_approved_product_implementation'
        ? SLICE10_PRODUCT_TARGET
        : SLICE9_PROMOTION_TARGET;
      return {
        kind: validated.tool,
        ran: true,
        path: target,
        bytes: Buffer.byteLength(body),
        inspection: {
          passed: true,
          failed: false,
          file: target,
          path: target,
          projectModified: true,
          checks: ['source-verified', 'source-analyzed', 'allow-listed-target', 'content-match'],
        },
      };
    }
    const workspace = path.join(this.repoRoot, allowedDirectory(validated.tool));
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(validated.absolutePath, validated.body, { encoding: 'utf8', flag: 'w' });
    return {
      kind: validated.tool,
      ran: true,
      path: validated.relativePath,
      bytes: Buffer.byteLength(validated.body),
    };
  }

  verify(request: ControlledExecutionRequest, execution: ControlledExecutionResult): ControlledVerificationResult {
    if (isInspectOnly(request.tool)) {
      const slug = String(request.args.filename ?? request.args.name ?? '');
      return request.tool === 'analyze_implementation_file'
        ? analyzeImplementationFile(this.repoRoot, slug)
        : inspectImplementationFile(this.repoRoot, slug);
    }
    if (request.tool === 'apply_approved_implementation' || request.tool === 'apply_approved_product_implementation') {
      const slug = String(request.args.filename ?? request.args.name ?? '');
      const target = request.tool === 'apply_approved_product_implementation'
        ? SLICE10_PRODUCT_TARGET
        : SLICE9_PROMOTION_TARGET;
      const placeholder = request.tool === 'apply_approved_product_implementation'
        ? SLICE10_PRODUCT_PLACEHOLDER
        : SLICE9_PROMOTION_PLACEHOLDER;
      const analysis = analyzeImplementationFile(this.repoRoot, slug);
      if (!analysis.passed) {
        return {
          passed: false,
          failed: true,
          file: target,
          projectModified: false,
          checks: ['source-verified', 'source-analyzed', 'allow-listed-target', 'content-match'],
          error: analysis.error || 'Implementation draft failed verify/analyze prerequisites.',
        };
      }
      try {
        const sourceRelative = `${AGENT_IMPLEMENTATION_DIR}/${slug}.ts`;
        const sourceAbsolute = assertControlledWritePath('write_implementation_file', sourceRelative, this.repoRoot);
        const expected = fs.readFileSync(sourceAbsolute, 'utf8');
        const targetAbsolute = assertControlledWritePath(request.tool, target, this.repoRoot);
        const onDisk = fs.existsSync(targetAbsolute) ? fs.readFileSync(targetAbsolute, 'utf8') : '';
        if (execution.path !== target || onDisk !== expected) {
          return {
            passed: false,
            failed: true,
            file: target,
            projectModified: onDisk !== placeholder,
            checks: ['source-verified', 'source-analyzed', 'allow-listed-target', 'content-match'],
            error: 'Promoted target did not match the approved draft.',
          };
        }
        return {
          passed: true,
          failed: false,
          file: target,
          path: target,
          projectModified: true,
          checks: ['source-verified', 'source-analyzed', 'allow-listed-target', 'content-match'],
        };
      } catch (error) {
        return {
          passed: false,
          failed: true,
          file: target,
          projectModified: false,
          checks: ['source-verified', 'source-analyzed', 'allow-listed-target', 'content-match'],
          error: (error as Error).message,
        };
      }
    }
    const checks = ['path-in-sandbox', 'content-match', 'policy', 'read_project_state', 'git_status'];
    try {
      const validated = this.validate(request);
      if (execution.path !== validated.relativePath || !fs.existsSync(validated.absolutePath)) {
        return {
          passed: false,
          failed: true,
          file: validated.relativePath,
          projectModified: false,
          checks,
          error: 'Written file was not found.',
          path: validated.relativePath,
        };
      }
      const onDisk = fs.readFileSync(validated.absolutePath, 'utf8');
      if (onDisk !== validated.body) {
        return {
          passed: false,
          failed: true,
          file: validated.relativePath,
          projectModified: true,
          checks,
          error: 'Written file did not match the approved body.',
          path: validated.relativePath,
        };
      }
      readProjectState(this.repoRoot);
      gitStatus(this.repoRoot);
      return {
        passed: true,
        failed: false,
        file: validated.relativePath,
        projectModified: true,
        checks,
        path: validated.relativePath,
      };
    } catch (error) {
      return {
        passed: false,
        failed: true,
        file: '',
        projectModified: false,
        checks,
        error: (error as Error).message,
      };
    }
  }
}
