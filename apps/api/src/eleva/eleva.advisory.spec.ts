import { Test, TestingModule } from '@nestjs/testing';
import { ElevaAdvisoryService } from './eleva.advisory';
import { AuditService } from '../audit/audit.service';
import { EvidenceLabel, AgentRequestIntent } from './eleva.state';

describe('ElevaAdvisoryService', () => {
  let service: ElevaAdvisoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElevaAdvisoryService],
    }).compile();

    service = module.get<ElevaAdvisoryService>(ElevaAdvisoryService);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should classify execution phrases as EXECUTION', async () => {
    expect(await service.classifyIntent('Please execute the discount migration now.')).toBe(AgentRequestIntent.EXECUTION);
  });

  it('should classify diagnostic phrases as DIAGNOSTIC', async () => {
    expect(await service.classifyIntent('Diagnose the failing checkout issue.')).toBe(AgentRequestIntent.DIAGNOSTIC);
  });

  it('should classify recommendation phrases as RECOMMENDATION', async () => {
    expect(await service.classifyIntent('What do you recommend for the next sprint?')).toBe(AgentRequestIntent.RECOMMENDATION);
  });

  it('should classify analysis phrases as ANALYSIS', async () => {
    expect(await service.classifyIntent('Analyze the current tenant isolation behavior.')).toBe(AgentRequestIntent.ANALYSIS);
  });

  it('should classify questions as QUESTION', async () => {
    expect(await service.classifyIntent('What is the current project status?')).toBe(AgentRequestIntent.QUESTION);
  });

  it('advise should include execution warning for execution intent', async () => {
    const findings = await service.advise('execute the plan now');
    expect(findings.length).toBe(1);
    expect(findings[0].finding).toContain('Execution request detected');
    expect(findings[0].evidence[0].label).toBe(EvidenceLabel.VERIFIED);
    expect(findings[0].recommendation).toContain('M2 approval/execution pipeline');
  });

  it('advise should include verified finding when repository facts are provided', async () => {
    const findings = await service.advise('review state', { repositoryFacts: { tableCount: 30 } });
    expect(findings.length).toBe(1);
    expect(findings[0].finding).toContain('Repository context');
    expect(findings[0].evidence[0].label).toBe(EvidenceLabel.VERIFIED);
    expect(findings[0].benefits).toEqual(['Reduces unknowns.', 'Improves recommendation quality.']);
  });

  it('advise should not fabricate facts when repository facts are missing', async () => {
    const findings = await service.advise('review state');
    expect(findings.length).toBe(1);
    expect(findings[0].evidence[0].label).toBe(EvidenceLabel.UNVERIFIED);
    expect(findings[0].unknowns).toEqual(['Static inspection cannot confirm runtime behavior.']);
  });

  it('compareOptions should require at least two options', () => {
    expect(() => service.compareOptions({ options: [], recommendedOption: 'A' })).toThrow();
  });

  it('compareOptions should select recommended option', () => {
    const comparison = service.compareOptions({
      options: [{ name: 'A' }, { name: 'B' }],
      recommendedOption: 'B',
      rationale: 'Lower risk',
    });
    expect(comparison.recommendedOption).toBe('B');
  });

  it('compareOptions should default to first option when none specified', () => {
    const comparison = service.compareOptions({ options: [{ name: 'A' }, { name: 'B' }] });
    expect(comparison.recommendedOption).toBe('A');
  });

  it('assessRisks should deduplicate identical risk entries', () => {
    const risks = service.assessRisks([
      { classification: 'HIGH', area: 'Deploy', triggerOrEvidence: 'probe', mitigation: 'retry' },
      { classification: 'HIGH', area: 'Deploy', triggerOrEvidence: 'probe', mitigation: 'retry' },
    ]);
    expect(risks.length).toBe(1);
  });

  it('assessRisks should keep distinct risk entries', () => {
    const risks = service.assessRisks([
      { classification: 'HIGH', area: 'Deploy', triggerOrEvidence: 'probe', mitigation: 'retry' },
      { classification: 'LOW', area: 'Deploy', triggerOrEvidence: 'probe', mitigation: 'ignore' },
    ]);
    expect(risks.length).toBe(2);
  });

  it('createPlan should require objective and phases', () => {
    expect(() => service.createPlan({ objective: '', phases: [], affectedComponents: [], dependencies: [], verificationRequirements: [], rollbackOrAbortCriteria: [] })).toThrow('Plan objective');
    expect(() => service.createPlan({ objective: 'x', phases: [], affectedComponents: [], dependencies: [], verificationRequirements: [], rollbackOrAbortCriteria: [] })).toThrow('Plan requires at least one phase');
  });

  it('createPlan should return normalized plan', () => {
    const plan = service.createPlan({
      objective: 'Add analytics',
      phases: [{ name: 'Implement' }],
      affectedComponents: ['analytics.service.ts'],
      dependencies: ['M1'],
      verificationRequirements: ['jest'],
      rollbackOrAbortCriteria: ['tsc failure'],
    });
    expect(plan.objective).toBe('Add analytics');
    expect(plan.phases.length).toBe(1);
  });

  it('buildExplanation should flag approvalRequired for high/critical risks', () => {
    const output = service.buildExplanation({
      problem: 'Deploy change',
      proposedImplementation: 'Migrate now',
      whatItFound: ['a'],
      whatItChecked: ['b'],
      evidence: ['c'],
      whatItDoesNotKnow: ['d'],
      whatItRecommends: ['e'],
      why: 'f',
      risks: [{ classification: 'CRITICAL', area: 'DB', triggerOrEvidence: 'test', mitigation: 'review' }],
      expectedImpact: 'g',
    });
    expect(output.approvalRequired).toBe(true);
  });

  it('buildExplanation should not require approval for low-risk advisory-only output', () => {
    const output = service.buildExplanation({
      problem: 'Review logs',
      whatItFound: ['a'],
      whatItChecked: ['b'],
      evidence: ['c'],
      whatItDoesNotKnow: ['d'],
      whatItRecommends: ['e'],
      why: 'f',
      risks: [{ classification: 'LOW', area: 'Logs', triggerOrEvidence: 'noise', mitigation: 'filter' }],
      expectedImpact: 'g',
    });
    expect(output.approvalRequired).toBeFalsy();
  });

  it('buildPresentation should fall back when analysis is empty', () => {
    const presentation = service.buildPresentation([]);
    expect(presentation.problem).toBe('No analysis available.');
    expect(presentation.decisionRequired).toContain('Provide analysis');
  });

  it('buildPresentation should map first finding when present', () => {
    const presentation = service.buildPresentation([
      {
        finding: 'Issue found',
        evidence: [{ label: EvidenceLabel.VERIFIED, source: 'file.ts' }],
        recommendation: 'Refactor',
        risks: [{ classification: 'MEDIUM', area: 'Auth', triggerOrEvidence: 'spec', mitigation: 'test' }],
        approvalRequired: true,
      },
    ]);
    expect(presentation.problem).toBe('Issue found');
    expect(presentation.recommendation).toBe('Refactor');
    expect(presentation.decisionRequired).toContain('approval');
  });

  it('buildVisualExplanation should produce typed contract', () => {
    const contract = service.buildVisualExplanation({
      type: 'architecture_diagram',
      description: 'ELEVA overview',
      inputs: ['request'],
      outputs: ['explanation'],
    });
    expect(contract.type).toBe('architecture_diagram');
    expect(contract.inputs).toEqual(['request']);
  });

  it('voiceBoundary should return unsupported boundary', () => {
    const boundary = service.voiceBoundary();
    expect(boundary.supported).toBe(false);
    expect(boundary.outputContract.advisoryText.type).toBe('string');
  });

  it('buildM2CompatibleTask should map advisory output to M2 task shape', () => {
    const task = service.buildM2CompatibleTask({ action: 'diagnostic' });
    expect(task).toEqual({
      action: 'diagnostic',
      toolName: 'agent.safe_demo_tool',
      capability: 'PROJECT_MANAGEMENT',
      requiredPermission: { action: 'read', resource: 'agent' },
      risk: 'LOW',
      input: { action: 'diagnostic' },
    });
  });

  it('recordDecision should store decision and emit audit', async () => {
    const mockAuditLog = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElevaAdvisoryService,
        {
          provide: AuditService,
          useValue: { log: mockAuditLog },
        },
      ],
    }).compile();

    const advisory = module.get<ElevaAdvisoryService>(ElevaAdvisoryService);
    const decision = advisory.recordDecision({
      summary: 'Deploy gateway',
      rationale: 'Required for M2 validation.',
      approvalStatus: 'approved',
      initiatedBy: 'user-1',
    });

    expect(decision.id).toBeDefined();
    expect(decision.summary).toBe('Deploy gateway');
    expect(decision.approvalStatus).toBe('approved');
    expect(advisory.getDecision(decision.id)).toEqual(decision);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGENT.RECORD_DECISION',
        entityName: 'ElevaDecision',
        entityId: decision.id,
      }),
    );
  });

  it('recordDecision should not throw when audit service is absent', () => {
    expect(() => service.recordDecision({ summary: 'x', rationale: 'y', approvalStatus: 'pending', initiatedBy: 'u' })).not.toThrow();
  });
});
