import { Test, TestingModule } from '@nestjs/testing';
import { ElevaResearchService } from './eleva.research';
import { EvidenceLabel } from './eleva.state';

describe('ElevaResearchService', () => {
  let service: ElevaResearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElevaResearchService],
    }).compile();

    service = module.get<ElevaResearchService>(ElevaResearchService);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should retrieve project context from the provided source resolver', async () => {
    service.setSourceResolver(async () => 'ELEVA project context from repository');
    const contexts = await service.retrieveProjectContext('ELEVA');
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts[0].location).toBe('repository-context');
  });

  it('should return no context when source resolver provides none', async () => {
    service.setSourceResolver(async () => null);
    const contexts = await service.retrieveProjectContext('ELEVA');
    expect(contexts.length).toBe(0);
  });

  it('should rank context by relevance', async () => {
    service.setSourceResolver(async () => 'ELEVA project context from repository');
    const contexts = await service.retrieveProjectContext('ELEVA');
    const ranked = await service.rankContext('ELEVA', contexts);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].score).toBeGreaterThanOrEqual(0);
    expect(ranked[0].location).toBeDefined();
  });

  it('should plan explicit research questions', () => {
    const plan = service.planResearch('What does the repository say about Sprint 1?');
    expect(plan.researchQuestions.length).toBeGreaterThan(0);
    expect(plan.requiredEvidence.length).toBeGreaterThan(0);
    expect(plan.needsExternalResearch).toBe(false);
  });

  it('should mark unknowns when context is missing', async () => {
    const plan = service.planResearch('x');
    expect(plan.requiredEvidence.length).toBeGreaterThan(0);
    const result = await service.executeResearch('x', []);
    expect(result.unknowns.length).toBeGreaterThan(0);
  });

  it('should execute research and classify evidence', async () => {
    service.setSourceResolver(async () => 'ELEVA project state is documented in PROJECT_STATE.md');
    const result = await service.executeResearch('ELEVA project state', []);
    expect(result.researchQuestion).toBe('ELEVA project state');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].evidenceClassification).toBe(EvidenceLabel.VERIFIED);
    expect(result.verifiedFacts.length + result.unknowns.length).toBeGreaterThan(0);
  });

  it('should preserve unknowns when context is missing', async () => {
    const result = await service.executeResearch('qwerty-xyz-unknown', []);
    expect(result.unknowns.length).toBeGreaterThan(0);
  });

  it('should build M4 advisory input from research results', async () => {
    service.setSourceResolver(async () => 'ELEVA project state is documented in PROJECT_STATE.md');
    const result = await service.executeResearch('ELEVA project state', []);
    const input = service.buildM4AdvisoryInput([result]);
    expect(input.research.length).toBe(1);
    expect(['high', 'medium', 'low']).toContain(input.conclusionConfidence);
    expect(input.affectedByConflict).toBe(false);
    expect(input.evidence.length).toBeGreaterThan(0);
  });

  it('should surface conflicts instead of silently resolving them', async () => {
    service.setSourceResolver(async () => 'first conflict context');
    const first = await service.retrieveProjectContext('conflict first second');
    service.setSourceResolver(async () => 'second conflict context');
    const second = await service.retrieveProjectContext('conflict first second');
    const result = await service.executeResearch('conflict first second', [...first, ...second]);
    expect((result.conflicts?.length ?? 0)).toBeGreaterThan(0);
    expect(result.conflicts?.[0].explanation).toContain('Conflicting evidence');
  });

  it('should not fabricate facts when source resolver is unavailable', async () => {
    service.setSourceResolver(async () => null);
    const result = await service.executeResearch('unknown topic', []);
    expect(result.unknowns.some((item) => item.includes('cannot confirm'))).toBe(true);
  });
});
