import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from './agent-tools';
import {
  ControlledAgentExecutor,
  parseAgentNoteInput,
  parseImplementationInput,
  parseVerifyImplementationInput,
  parseAnalyzeImplementationInput,
  inspectImplementationFile,
  analyzeImplementationFile,
  parseApplyApprovedImplementationInput,
  parseApplyApprovedProductImplementationInput,
  SLICE9_PROMOTION_TARGET,
  SLICE9_PROMOTION_PLACEHOLDER,
  SLICE10_PRODUCT_TARGET,
  SLICE10_PRODUCT_PLACEHOLDER,
} from './agent-executor';

describe('ControlledAgentExecutor', () => {
  const repoRoot = findRepoRoot(path.join(__dirname, '../../../..'));
  const executor = new ControlledAgentExecutor(repoRoot);
  const notePath = path.join(repoRoot, 'docs/agent-workspace/slice5-note.md');
  const implPath = path.join(repoRoot, 'apps/api/src/agent/implementation/slice6-draft.ts');
  const promotedPath = path.join(repoRoot, SLICE9_PROMOTION_TARGET);
  const productPath = path.join(repoRoot, SLICE10_PRODUCT_TARGET);

  afterEach(() => {
    if (fs.existsSync(notePath)) {
      fs.unlinkSync(notePath);
    }
    if (fs.existsSync(implPath)) {
      fs.unlinkSync(implPath);
    }
    fs.writeFileSync(promotedPath, SLICE9_PROMOTION_PLACEHOLDER);
    fs.writeFileSync(productPath, SLICE10_PRODUCT_PLACEHOLDER);
  });

  it('rejects unsupported operations', () => {
    expect(() => executor.validate({ tool: 'apply_patch', args: { filename: 'x', body: 'y' } })).toThrow(/not allow-listed/);
  });

  it('rejects invalid filename schema', () => {
    expect(() => parseAgentNoteInput({ filename: '../etc', body: 'hello' })).toThrow(/filename/);
    expect(() => parseAgentNoteInput({ filename: 'OK!', body: 'hello' })).toThrow(/filename/);
  });

  it('rejects paths outside the Agent workspace', () => {
    expect(() => executor.validate({
      tool: 'write_agent_note',
      args: { filename: 'ok', body: 'hello' },
      approvedPlan: { filesAffected: ['apps/api/src/main.ts'] },
    })).toThrow(/does not match/);
  });

  it('writes an approved note and verifies COMPLETED checks', () => {
    const request = {
      tool: 'write_agent_note',
      args: { filename: 'slice5-note', body: 'Slice 5 controlled note' },
      approvedPlan: { filesAffected: ['docs/agent-workspace/slice5-note.md'] },
    };
    const ran = executor.execute(request);
    expect(ran.ran).toBe(true);
    expect(fs.readFileSync(notePath, 'utf8')).toBe('Slice 5 controlled note');
    const verified = executor.verify(request, ran);
    expect(verified.passed).toBe(true);
  });

  it('fails verification when the written file is missing or mismatched', () => {
    const request = {
      tool: 'write_agent_note',
      args: { filename: 'slice5-note', body: 'expected' },
      approvedPlan: { filesAffected: ['docs/agent-workspace/slice5-note.md'] },
    };
    const verified = executor.verify(request, { kind: 'write_agent_note', ran: true, path: 'docs/agent-workspace/other.md', bytes: 1 });
    expect(verified.passed).toBe(false);
  });

  it('rejects invalid implementation filenames and forbidden bodies', () => {
    expect(() => parseImplementationInput({ filename: '../main', body: 'export const x = 1;' })).toThrow(/filename/);
    expect(() => parseImplementationInput({
      filename: 'ok',
      body: "import { spawnSync } from 'child_process'; export const x = 1;",
    })).toThrow(/forbidden/);
    expect(() => parseImplementationInput({ filename: 'ok', body: 'const x = 1;' })).toThrow(/export/);
  });

  it('writes an approved implementation draft only under the sandbox directory', () => {
    const body = 'export function draft(): string { return "slice-6"; }\n';
    const request = {
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    };
    const ran = executor.execute(request);
    expect(ran.kind).toBe('write_implementation_file');
    expect(ran.path).toBe('apps/api/src/agent/implementation/slice6-draft.ts');
    expect(fs.readFileSync(implPath, 'utf8')).toBe(body);
    expect(executor.verify(request, ran).passed).toBe(true);
  });

  it('rejects an implementation plan that targets production source', () => {
    expect(() => executor.validate({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body: 'export const x = 1;\n' },
      approvedPlan: { filesAffected: ['apps/api/src/agent/agent.service.ts'] },
    })).toThrow(/does not match/);
  });

  it('rejects verify_implementation_file outside the sandbox', () => {
    expect(() => parseVerifyImplementationInput({ filename: '../agent.service' })).toThrow(/filename/);
    expect(() => executor.validate({
      tool: 'verify_implementation_file',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/main.ts'] },
    })).toThrow(/does not match/);
  });

  it('inspects an approved sandbox draft without writing', () => {
    const body = 'export function draft(): string { return "slice-7"; }\n';
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    const before = fs.statSync(implPath).mtimeMs;
    const request = {
      tool: 'verify_implementation_file',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    };
    const ran = executor.execute(request);
    expect(ran.kind).toBe('verify_implementation_file');
    expect(ran.ran).toBe(true);
    expect(fs.readFileSync(implPath, 'utf8')).toBe(body);
    expect(fs.statSync(implPath).mtimeMs).toBe(before);
    const verified = executor.verify(request, ran);
    expect(verified.passed).toBe(true);
    expect(verified.projectModified).toBe(false);
    expect(verified.failed).toBe(false);
    expect(verified.file).toBe('apps/api/src/agent/implementation/slice6-draft.ts');
    expect(verified.checks).toEqual(expect.arrayContaining([
      'exists', 'sandbox-path', 'typescript', 'export', 'forbidden-ops',
    ]));
  });

  it('fails inspection when the sandbox file is missing or forbidden', () => {
    const missing = inspectImplementationFile(repoRoot, 'slice6-draft');
    expect(missing.passed).toBe(false);
    expect(missing.failed).toBe(true);
    fs.writeFileSync(implPath, "import { spawnSync } from 'child_process'; export const x = 1;\n");
    const forbidden = inspectImplementationFile(repoRoot, 'slice6-draft');
    expect(forbidden.passed).toBe(false);
    expect(String(forbidden.error)).toMatch(/forbidden|child_process/);
  });

  it('rejects analyze_implementation_file outside the sandbox', () => {
    expect(() => parseAnalyzeImplementationInput({ filename: '../agent.service' })).toThrow(/filename/);
    expect(() => executor.validate({
      tool: 'analyze_implementation_file',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/main.ts'] },
    })).toThrow(/does not match/);
  });

  it('analyzes a valid sandbox draft without writing', () => {
    const body = "import { inspect } from 'util';\nexport function draft(): string { return 'slice-8'; }\n";
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    const before = fs.readFileSync(implPath, 'utf8');
    const request = {
      tool: 'analyze_implementation_file',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    };
    const ran = executor.execute(request);
    expect(ran.kind).toBe('analyze_implementation_file');
    expect(fs.readFileSync(implPath, 'utf8')).toBe(before);
    const analyzed = analyzeImplementationFile(repoRoot, 'slice6-draft');
    expect(analyzed.passed).toBe(true);
    expect(analyzed.failed).toBe(false);
    expect(analyzed.file).toBe('apps/api/src/agent/implementation/slice6-draft.ts');
    expect(analyzed.exportsDetected).toEqual(['draft']);
    expect(analyzed.importsDetected).toEqual(['util']);
    expect(analyzed.dependenciesDetected).toEqual(['util']);
    expect(analyzed.suggestedNextStep).toMatch(/later approved slice/i);
    expect(executor.verify(request, ran).passed).toBe(true);
    expect(executor.verify(request, ran).projectModified).toBe(false);
  });

  it('fails analysis when the draft is missing or forbidden', () => {
    expect(analyzeImplementationFile(repoRoot, 'slice6-draft').passed).toBe(false);
    fs.writeFileSync(implPath, "import { spawnSync } from 'child_process'; export const x = 1;\n");
    const forbidden = analyzeImplementationFile(repoRoot, 'slice6-draft');
    expect(forbidden.passed).toBe(false);
    expect(String(forbidden.error)).toMatch(/forbidden|child_process/);
  });

  it('rejects apply_approved_implementation path traversal and wrong targets', () => {
    expect(() => parseApplyApprovedImplementationInput({ filename: '../agent.service' })).toThrow(/filename/);
    expect(() => parseApplyApprovedImplementationInput({
      filename: 'slice6-draft',
      target: 'apps/api/src/agent/agent.service.ts',
    })).toThrow(/allow-listed/);
    expect(() => parseApplyApprovedImplementationInput({
      filename: 'slice6-draft',
      target: '/tmp/evil.ts',
    })).toThrow(/allow-listed|Absolute/);
  });

  it('promotes a valid draft to the Slice 9 sink only', () => {
    const body = 'export function draft(): string { return "slice-9"; }\n';
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    const request = {
      tool: 'apply_approved_implementation',
      args: { filename: 'slice6-draft', target: SLICE9_PROMOTION_TARGET },
      approvedPlan: {
        filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts', SLICE9_PROMOTION_TARGET],
      },
    };
    const ran = executor.execute(request);
    expect(ran.kind).toBe('apply_approved_implementation');
    expect(ran.path).toBe(SLICE9_PROMOTION_TARGET);
    expect(fs.readFileSync(promotedPath, 'utf8')).toBe(body);
    expect(fs.readFileSync(implPath, 'utf8')).toBe(body);
    const verified = executor.verify(request, ran);
    expect(verified.passed).toBe(true);
    expect(verified.file).toBe(SLICE9_PROMOTION_TARGET);
  });

  it('rejects apply when the plan source or target is wrong', () => {
    const body = 'export function draft(): string { return "x"; }\n';
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    expect(() => executor.validate({
      tool: 'apply_approved_implementation',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/other.ts', SLICE9_PROMOTION_TARGET] },
    })).toThrow(/does not match/);
  });

  it('rejects apply when the draft is forbidden', () => {
    fs.mkdirSync(path.dirname(implPath), { recursive: true });
    fs.writeFileSync(implPath, "import { spawnSync } from 'child_process'; export const x = 1;\n");
    expect(() => executor.execute({
      tool: 'apply_approved_implementation',
      args: { filename: 'slice6-draft' },
      approvedPlan: {
        filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts', SLICE9_PROMOTION_TARGET],
      },
    })).toThrow(/forbidden|child_process/);
    expect(fs.readFileSync(promotedPath, 'utf8')).toBe(SLICE9_PROMOTION_PLACEHOLDER);
  });

  it('rejects apply_approved_product_implementation path traversal and wrong targets', () => {
    expect(() => parseApplyApprovedProductImplementationInput({ filename: '../agent.service' })).toThrow(/filename/);
    expect(() => parseApplyApprovedProductImplementationInput({
      filename: 'slice6-draft',
      target: 'apps/api/src/agent/agent.service.ts',
    })).toThrow(/allow-listed/);
    expect(() => parseApplyApprovedProductImplementationInput({
      filename: 'slice6-draft',
      target: '/tmp/evil.ts',
    })).toThrow(/allow-listed|Absolute/);
    expect(() => parseApplyApprovedProductImplementationInput({
      filename: 'slice6-draft',
      target: SLICE9_PROMOTION_TARGET,
    })).toThrow(/allow-listed/);
  });

  it('promotes a valid draft to the Slice 10 product sink only', () => {
    const body = 'export function draft(): string { return "slice-10"; }\n';
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    const request = {
      tool: 'apply_approved_product_implementation',
      args: { filename: 'slice6-draft', target: SLICE10_PRODUCT_TARGET },
      approvedPlan: {
        filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts', SLICE10_PRODUCT_TARGET],
      },
    };
    const ran = executor.execute(request);
    expect(ran.kind).toBe('apply_approved_product_implementation');
    expect(ran.path).toBe(SLICE10_PRODUCT_TARGET);
    expect(fs.readFileSync(productPath, 'utf8')).toBe(body);
    expect(fs.readFileSync(implPath, 'utf8')).toBe(body);
    expect(fs.readFileSync(promotedPath, 'utf8')).toBe(SLICE9_PROMOTION_PLACEHOLDER);
    const verified = executor.verify(request, ran);
    expect(verified.passed).toBe(true);
    expect(verified.file).toBe(SLICE10_PRODUCT_TARGET);
  });

  it('rejects product apply when the plan source or target is wrong', () => {
    const body = 'export function draft(): string { return "x"; }\n';
    executor.execute({
      tool: 'write_implementation_file',
      args: { filename: 'slice6-draft', body },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts'] },
    });
    expect(() => executor.validate({
      tool: 'apply_approved_product_implementation',
      args: { filename: 'slice6-draft' },
      approvedPlan: { filesAffected: ['apps/api/src/agent/implementation/other.ts', SLICE10_PRODUCT_TARGET] },
    })).toThrow(/does not match/);
  });

  it('rejects product apply when the draft is forbidden', () => {
    fs.mkdirSync(path.dirname(implPath), { recursive: true });
    fs.writeFileSync(implPath, "import { spawnSync } from 'child_process'; export const x = 1;\n");
    expect(() => executor.execute({
      tool: 'apply_approved_product_implementation',
      args: { filename: 'slice6-draft' },
      approvedPlan: {
        filesAffected: ['apps/api/src/agent/implementation/slice6-draft.ts', SLICE10_PRODUCT_TARGET],
      },
    })).toThrow(/forbidden|child_process/);
    expect(fs.readFileSync(productPath, 'utf8')).toBe(SLICE10_PRODUCT_PLACEHOLDER);
  });
});
