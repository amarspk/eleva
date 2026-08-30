import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AgentController } from './agent.controller';
import { ElevaService } from './eleva.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { CaslAbilityFactory } from '../auth/casl-ability.factory';

describe('AgentController', () => {
  let controller: AgentController;
  let service: ElevaService;

  const mockReflector = {
    get: jest.fn(),
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };

  const mockJwtAuthGuard = { canActivate: jest.fn(() => true) };
  const mockRbacPermissionGuard = { canActivate: jest.fn(() => true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        ElevaService,
        JwtAuthGuard,
        RbacPermissionGuard,
        CaslAbilityFactory,
        { provide: Reflector, useValue: mockReflector },
      ],
    })
    .overrideProvider(JwtAuthGuard)
    .useValue(mockJwtAuthGuard)
    .overrideProvider(RbacPermissionGuard)
    .useValue(mockRbacPermissionGuard)
    .compile();

    controller = module.get<AgentController>(AgentController);
    service = module.get<ElevaService>(ElevaService);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return agent status', () => {
    const response = controller.getStatus();
    expect(response.status).toBe('IDLE');
    expect(response.activeCapability).toBeNull();
    expect(response.updatedAt).toBeDefined();
  });

  it('should return capabilities', () => {
    const capabilities = controller.getCapabilities();
    expect(capabilities.length).toBe(10);
    expect(capabilities.some((cap) => cap.name === 'ACCOUNTING')).toBe(true);
  });

  it('should return permissions', () => {
    const permissions = controller.getPermissions();
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions.some((p) => p.action === 'read' && p.resource === 'project')).toBe(true);
  });

  it('should return approval status by actionId', () => {
    service.recordApproval('action-1', 'ANALYTICS');
    const response = controller.getApproval('action-1');
    expect(response.actionId).toBe('action-1');
    expect(response.approved).toBe(true);
  });

  it('should return not approved for unknown actionId', () => {
    const response = controller.getApproval('unknown-action');
    expect(response.actionId).toBe('unknown-action');
    expect(response.approved).toBe(false);
  });
});
