import * as path from 'path';
import {
  assertSafeRelativePath,
  findRepoRoot,
  gitLog,
  gitStatus,
  isDeniedRepoPath,
  readProjectState,
  readRepoFile,
} from './agent-tools';

describe('Agent V1 SAFE tools', () => {
  const repoRoot = findRepoRoot(path.join(__dirname, '../../../..'));

  it('resolves PROJECT_STATE.md from the repo root', () => {
    const state = readProjectState(repoRoot);
    expect(state.path).toBe('PROJECT_STATE.md');
    expect(state.content).toContain('# PROJECT STATE');
    expect(state.bytes).toBeGreaterThan(1000);
  });

  it('reads a non-secret repository file', () => {
    const file = readRepoFile(repoRoot, 'package.json');
    expect(file.content).toContain('"name"');
  });

  it('denies .env, git config, secrets, and parent traversal', () => {
    expect(isDeniedRepoPath('.env')).toBe(true);
    expect(isDeniedRepoPath('.env.production')).toBe(true);
    expect(isDeniedRepoPath('.git/config')).toBe(true);
    expect(isDeniedRepoPath('k8s/secrets.yml')).toBe(true);
    expect(isDeniedRepoPath('certs/prod.pem')).toBe(true);
    expect(() => assertSafeRelativePath('../package.json')).toThrow(/parent-directory/);
    expect(() => assertSafeRelativePath('.env')).toThrow(/Access denied/);
    expect(() => readRepoFile(repoRoot, '.git/config')).toThrow(/Access denied/);
    expect(() => readRepoFile(repoRoot, 'k8s/secrets.yml')).toThrow(/Access denied/);
  });

  it('returns git status and log output', () => {
    expect(gitStatus(repoRoot).output.length).toBeGreaterThan(0);
    expect(gitLog(repoRoot, 3).output.split('\n').length).toBeGreaterThan(0);
  });
});
