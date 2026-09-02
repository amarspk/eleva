import { HealthStatus, DeploymentStatus, BackupStatus, OperationalStatus } from './eleva.operations';
import { ElevaOperationalController } from './operational.controller';

describe('ElevaOperationalController', () => {
  const createController = () => {
    const service = {
      getHealth: jest.fn(),
      getDeployment: jest.fn(),
      getBackup: jest.fn(),
      getOperationalStatus: jest.fn(),
    } as unknown as jest.Mocked<import('./eleva.operations').ElevaOperationalService>;

    return { controller: new ElevaOperationalController(service), service };
  };

  const buildHealth = (overrides: Partial<HealthStatus> = {}): HealthStatus => ({
    status: 'healthy',
    checkedAt: new Date('2026-09-01T04:00:00.000Z'),
    source: 'health-provider',
    details: { uptime: '1h' },
    ...overrides,
  });

  const buildDeployment = (overrides: Partial<DeploymentStatus> = {}): DeploymentStatus => ({
    status: 'deployed',
    checkedAt: new Date('2026-09-01T04:00:00.000Z'),
    environment: 'production',
    version: '2026.09.01',
    source: 'deployment-provider',
    details: { replicas: 2 },
    ...overrides,
  });

  const buildBackup = (overrides: Partial<BackupStatus> = {}): BackupStatus => ({
    status: 'ok',
    checkedAt: new Date('2026-09-01T04:00:00.000Z'),
    lastBackupAt: new Date('2026-08-31T23:00:00.000Z'),
    source: 'backup-provider',
    details: { provider: 'local' },
    ...overrides,
  });

  const buildStatus = (overrides: Partial<OperationalStatus> = {}): OperationalStatus => ({
    health: buildHealth(),
    deployment: buildDeployment(),
    backup: buildBackup(),
    checkedAt: new Date('2026-09-01T04:00:00.000Z'),
    source: 'eleva-operational-composite',
    ...overrides,
  });

  it('should be defined', () => {
    const { controller } = createController();
    expect(controller).toBeDefined();
  });

  it('should map health response', async () => {
    const { controller, service } = createController();
    service.getHealth.mockResolvedValue(buildHealth({ status: 'degraded', details: { cpu: 'high' } }));

    const response = await controller.getHealth();

    expect(response).toEqual({
      source: 'health-provider',
      status: 'degraded',
      checkedAt: '2026-09-01T04:00:00.000Z',
      details: { cpu: 'high' },
    });
  });

  it('should map deployment response', async () => {
    const { controller, service } = createController();
    service.getDeployment.mockResolvedValue(buildDeployment({ status: 'failed', version: undefined }));

    const response = await controller.getDeployment();

    expect(response).toEqual({
      source: 'deployment-provider',
      status: 'failed',
      checkedAt: '2026-09-01T04:00:00.000Z',
      environment: 'production',
      version: undefined,
      details: { replicas: 2 },
    });
  });

  it('should map backup response', async () => {
    const { controller, service } = createController();
    service.getBackup.mockResolvedValue(buildBackup({ status: 'stale', lastBackupAt: undefined }));

    const response = await controller.getBackup();

    expect(response).toEqual({
      source: 'backup-provider',
      status: 'stale',
      checkedAt: '2026-09-01T04:00:00.000Z',
      lastBackupAt: undefined,
      details: { provider: 'local' },
    });
  });

  it('should compose operational status from mapped providers', async () => {
    const { controller, service } = createController();
    service.getOperationalStatus.mockResolvedValue(buildStatus());

    const response = await controller.getStatus();

    expect(response.source).toBe('eleva-operational-composite');
    expect(response.health.status).toBe('healthy');
    expect(response.deployment.environment).toBe('production');
    expect(response.backup.lastBackupAt).toBe('2026-08-31T23:00:00.000Z');
    expect(response.checkedAt).toBe('2026-09-01T04:00:00.000Z');
  });
});
