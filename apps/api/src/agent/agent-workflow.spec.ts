import { buildStructuredWorkPlan, deriveWorkflowState } from './agent-workflow';

describe('Agent workflow helpers', () => {
  it('maps persisted statuses to UI workflow states', () => {
    expect(deriveWorkflowState('PROPOSED')).toBe('AWAITING_APPROVAL');
    expect(deriveWorkflowState('APPROVED')).toBe('APPROVED');
    expect(deriveWorkflowState('EXECUTING')).toBe('EXECUTING');
    expect(deriveWorkflowState('VERIFYING')).toBe('VERIFYING');
    expect(deriveWorkflowState('COMPLETED')).toBe('COMPLETED');
    expect(deriveWorkflowState('FAILED')).toBe('FAILED');
    expect(deriveWorkflowState('REJECTED')).toBe('REJECTED');
  });

  it('builds a structured plan with required Slice 4 fields', () => {
    const plan = buildStructuredWorkPlan('propose_plan', {
      objective: 'Inspect catalog',
      filesAffected: ['apps/api/src/menu'],
      intendedChanges: ['None yet'],
      verificationSteps: ['git status'],
      riskLevel: 'low',
    });
    expect(plan.objective).toBe('Inspect catalog');
    expect(plan.filesAffected).toEqual(['apps/api/src/menu']);
    expect(plan.intendedChanges).toEqual(['None yet']);
    expect(plan.verificationSteps).toContain('git status');
    expect(plan.riskLevel).toBe('low');
  });
});
