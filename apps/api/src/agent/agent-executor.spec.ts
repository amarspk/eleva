import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from './agent-tools';
import { ControlledAgentExecutor, parseAgentNoteInput } from './agent-executor';

describe('ControlledAgentExecutor', () => {
  const repoRoot = findRepoRoot(path.join(__dirname, '../../../..'));
  const executor = new ControlledAgentExecutor(repoRoot);
  const notePath = path.join(repoRoot, 'docs/agent-workspace/slice5-note.md');

  afterEach(() => {
    if (fs.existsSync(notePath)) {
      fs.unlinkSync(notePath);
    }
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
});
