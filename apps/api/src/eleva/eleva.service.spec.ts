import { Test, TestingModule } from '@nestjs/testing';
import { ElevaService } from './eleva.service';
import { AgentStatus, AgentCapability } from './eleva.state';
import { AuditService } from '../audit/audit.service';

describe('ElevaService', () => {
  let service: ElevaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ElevaService],
    }).compile();

    service = module.get<ElevaService>(ElevaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return initial idle state', () => {
    const state = service.getStatus();
    expect(state.status).toBe(AgentStatus.IDLE);
    expect(state.activeCapability).toBeNull();
  });

  it('should start a capability and move to RUNNING', () => {
    service.startCapability('ANALYTICS');
    const state = service.getStatus();
    expect(state.status).toBe(AgentStatus.RUNNING);
    expect(state.activeCapability).toBe('ANALYTICS');
  });

  it('should stop an active capability and return to IDLE', () => {
    service.startCapability('SECURITY');
    service.stopCapability();
    const state = service.getStatus();
    expect(state.status).toBe(AgentStatus.IDLE);
    expect(state.activeCapability).toBeNull();
  });

  it('should move to ERROR on failure', () => {
    service.failCapability();
    const state = service.getStatus();
    expect(state.status).toBe(AgentStatus.ERROR);
    expect(state.activeCapability).toBeNull();
  });

  it('should expose the registry entries', () => {
    expect(service.getCapabilities()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ACCOUNTING', enabled: true }),
        expect.objectContaining({ name: 'SAFETY', enabled: true }),
        expect.objectContaining({ name: 'DEVELOPMENT', enabled: true }),
        expect.objectContaining({ name: 'ANALYTICS', enabled: true }),
        expect.objectContaining({ name: 'DEVOPS', enabled: true }),
        expect.objectContaining({ name: 'QA', enabled: true }),
        expect.objectContaining({ name: 'PROJECT_MANAGEMENT', enabled: true }),
        expect.objectContaining({ name: 'MONITORING', enabled: true }),
        expect.objectContaining({ name: 'BACKUP', enabled: true }),
        expect.objectContaining({ name: 'SECURITY', enabled: true }),
      ]),
    );
  });

  it.each([['ACCOUNTING'], ['SAFETY'], ['DEVELOPMENT'], ['ANALYTICS'], ['DEVOPS'], ['QA'], ['PROJECT_MANAGEMENT'], ['MONITORING'], ['BACKUP'], ['SECURITY']] as [AgentCapability][])(
    'should approve and revoke actions for capability %s',
    (capability) => {
      const actionId = `action-${capability.toLowerCase()}`;
      expect(service.isApproved(actionId)).toBe(false);

      expect(service.recordApproval(actionId, capability)).toBe(true);
      expect(service.isApproved(actionId)).toBe(true);

      expect(service.revokeApproval(actionId)).toBe(true);
      expect(service.isApproved(actionId)).toBe(false);
    },
  );

  it('should have a permission set', () => {
    const permissions = service.getPermissions();
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions.some(p => p.action === 'read' && p.resource === 'project')).toBe(true);
  });

  it('should evaluate permissions', () => {
    expect(service.hasPermission('read', 'project')).toBe(true);
    expect(service.hasPermission('deploy', 'production')).toBe(true);
    expect(service.hasPermission('unknown', 'none')).toBe(false);
  });

  it('should include agent read permission', () => {
    const permissions = service.getPermissions();
    expect(permissions.some(p => p.action === 'read' && p.resource === 'agent')).toBe(true);
    expect(service.hasPermission('read', 'agent')).toBe(true);
  });
});

describe('ElevaService audit integration', () => {
  const mockAuditLog = jest.fn().mockResolvedValue({ id: 'audit-1' });

  async function createTestingModule(): Promise<TestingModule> {
    const module = await Test.createTestingModule({
      providers: [
        ElevaService,
        {
          provide: AuditService,
          useValue: { log: mockAuditLog },
        },
      ],
    }).compile();

    return module;
  }

  it('should emit audit log when capability state changes', async () => {
    const module = await createTestingModule();
    const service = module.get<ElevaService>(ElevaService);

    mockAuditLog.mockClear();
    service.startCapability('ANALYTICS');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGENT.START_CAPABILITY',
        entityName: 'ElevaCapability',
        entityId: 'ANALYTICS',
        newValues: expect.objectContaining({ capability: 'ANALYTICS' }),
      }),
    );
  });

  it('should emit audit log when approvals are recorded', async () => {
    const module = await createTestingModule();
    const service = module.get<ElevaService>(ElevaService);

    mockAuditLog.mockClear();
    service.recordApproval('action-security-1', 'SECURITY');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGENT.RECORD_APPROVAL',
        entityName: 'ElevaApproval',
        entityId: 'action-security-1',
        newValues: expect.objectContaining({ capability: 'SECURITY' }),
      }),
    );
  });

  it('should emit audit log when approvals are revoked', async () => {
    const module = await createTestingModule();
    const service = module.get<ElevaService>(ElevaService);

    mockAuditLog.mockClear();
    service.recordApproval('action-security-1', 'SECURITY');
    service.revokeApproval('action-security-1');

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AGENT.REVOKE_APPROVAL',
        entityName: 'ElevaApproval',
        entityId: 'action-security-1',
      }),
    );
  });

  it('should preserve existing approval and revocation semantics', async () => {
    const module = await createTestingModule();
    const service = module.get<ElevaService>(ElevaService);

    expect(service.isApproved('action-unknown')).toBe(false);
    expect(service.recordApproval('action-unknown', 'ANALYTICS')).toBe(true);
    expect(service.isApproved('action-unknown')).toBe(true);
    expect(service.revokeApproval('action-unknown')).toBe(true);
    expect(service.isApproved('action-unknown')).toBe(false);
  });

  it('should not fail when AuditService is absent', async () => {
    const module = await Test.createTestingModule({
      providers: [ElevaService],
    }).compile();

    const service = module.get<ElevaService>(ElevaService);

    expect(() => {
      service.setStatus(AgentStatus.RUNNING, 'ANALYTICS');
      service.startCapability('ANALYTICS');
      service.recordApproval('action-1', 'ANALYTICS');
    }).not.toThrow();
  });
});
