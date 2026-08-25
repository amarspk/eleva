import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertSafeRelativePath,
  findRepoRoot,
  gitLog,
  gitStatus,
  isDeniedRepoPath,
  readProjectSpec,
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

  it('lists and reads approved specification files with source paths', () => {
    const listed = readProjectSpec(repoRoot, { list: true });
    expect(listed.status).toBe('LIST');
    expect(listed.available.some((item) => item.path === 'DOC-001.md' && item.exists)).toBe(true);
    expect(listed.verifiedFacts.every((fact) => fact.status === 'VERIFIED' && fact.sourcePath)).toBe(true);
    const spec = readProjectSpec(repoRoot, { spec: 'DOC-001.md' });
    expect(spec.status).toBe('VERIFIED');
    expect(spec.sourcePath).toBe('DOC-001.md');
    expect(String(spec.content)).toContain('SYSTEM ARCHITECTURE');
    expect(spec.verifiedFacts[0].sourcePath).toBe('DOC-001.md');
    expect(spec.unknownInformation.some((item) => item.status === 'UNKNOWN')).toBe(true);
  });

  it('rejects unapproved, traversal, and secret paths for read_project_spec', () => {
    expect(() => readProjectSpec(repoRoot, { path: 'package.json' })).toThrow(/allow-list/);
    expect(() => readProjectSpec(repoRoot, { path: '../package.json' })).toThrow(/parent-directory|Absolute/);
    expect(() => readProjectSpec(repoRoot, { path: '/etc/passwd' })).toThrow(/Absolute|allow-list|Access denied/);
    expect(() => readProjectSpec(repoRoot, { path: '.env' })).toThrow(/Access denied/);
    expect(() => readProjectSpec(repoRoot, { path: 'k8s/secrets.yml' })).toThrow(/Access denied|allow-list/);
    expect(() => readProjectSpec(repoRoot, { path: 'apps/api/src/main.ts' })).toThrow(/allow-list/);
  });

  it('returns structured MISSING for an allow-listed spec that is not on disk', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eleva-spec-'));
    fs.writeFileSync(path.join(tmp, 'PROJECT_STATE.md'), '# PROJECT STATE\n');
    const missing = readProjectSpec(tmp, { spec: 'DOC-001.md' });
    expect(missing.status).toBe('MISSING');
    expect(missing.content).toBe(null);
    expect(missing.sourcePath).toBe('DOC-001.md');
    expect(missing.missingInformation[0]).toMatchObject({ status: 'MISSING', sourcePath: 'DOC-001.md' });
    expect(missing.unknownInformation.some((item) => item.status === 'UNKNOWN')).toBe(true);
    expect(JSON.stringify(missing)).not.toMatch(/I assume the missing specification says/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns git status and log output', () => {
    expect(gitStatus(repoRoot).output.length).toBeGreaterThan(0);
    expect(gitLog(repoRoot, 3).output.split('\n').length).toBeGreaterThan(0);
  });
});
