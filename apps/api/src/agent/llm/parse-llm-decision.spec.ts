import { parseLlmDecision, sanitizeSafeToolCalls } from './parse-llm-decision';

describe('LLM decision sanitizer', () => {
  it('drops apply_patch, deploy, and unknown tools from LLM output', () => {
    const kept = sanitizeSafeToolCalls([
      { tool: 'read_project_state', args: {} },
      { tool: 'apply_patch', args: { path: 'x' } },
      { tool: 'deploy', args: {} },
      { tool: 'rm_rf', args: {} },
      { tool: 'git_log', args: { limit: 3 } },
    ]);
    expect(kept.map((item) => item.tool)).toEqual(['read_project_state', 'git_log']);
  });

  it('parses mixed-language JSON without inventing tools', () => {
    const decision = parseLlmDecision({
      language: 'mixed',
      intent: 'inspect',
      reply: 'ELEVA افحص',
      questions: [],
      safeTools: [{ tool: 'read_project_state' }, { tool: 'stripe_action' }],
      propose: false,
    });
    expect(decision.language).toBe('mixed');
    expect(decision.safeTools).toEqual([{ tool: 'read_project_state', args: {} }]);
  });
});
