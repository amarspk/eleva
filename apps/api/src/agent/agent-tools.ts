import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const SAFE_AGENT_TOOLS = ['read_project_state', 'read_repo_file', 'git_status', 'git_log'] as const;
export type SafeAgentTool = (typeof SAFE_AGENT_TOOLS)[number];

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
