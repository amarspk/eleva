import { HeuristicLlmProvider } from './heuristic-llm.provider';

describe('HeuristicLlmProvider bilingual planning', () => {
  const provider = new HeuristicLlmProvider();
  const excerpt = '# PROJECT STATE — ELEVA\nPhase 4 CLOSED.';

  it('asks clarification for Arabic add-product without guessing fields', async () => {
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'أريد أضيف منتج جديد' }],
      projectStateExcerpt: excerpt,
      allowlistedSafeTools: ['read_project_state'],
    });
    expect(decision.intent).toBe('clarify');
    expect(decision.propose).toBe(false);
    expect(decision.safeTools).toEqual([]);
    expect(decision.questions.length).toBeGreaterThanOrEqual(3);
    expect(decision.reply).toMatch(/مطعم|منتج|سعر/);
  });

  it('inspects mixed Arabic/English order issues with SAFE tools only', async () => {
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'ELEVA افحص مشكلة الطلبات' }],
      projectStateExcerpt: excerpt,
      allowlistedSafeTools: ['read_project_state', 'git_status'],
    });
    expect(decision.language).toBe('mixed');
    expect(decision.intent).toBe('inspect');
    expect(decision.safeTools.every((call) => ['read_project_state', 'git_status', 'git_log', 'read_repo_file'].includes(call.tool))).toBe(true);
    expect(decision.reply).toMatch(/PROJECT_STATE|لا يقرأ/);
  });

  it('plans product-system work without executing', async () => {
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'طور نظام المنتجات' }],
      projectStateExcerpt: excerpt,
      allowlistedSafeTools: ['read_project_state'],
    });
    expect(decision.intent).toBe('plan');
    expect(decision.propose).toBe(true);
    expect(decision.plan?.summary.length).toBeGreaterThan(10);
    expect(decision.plan?.missingInformation.length).toBeGreaterThan(0);
  });
});
