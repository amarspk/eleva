import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

// ==========================================
// Operational capability contracts
// ==========================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checkedAt: Date;
  details?: Record<string, unknown>;
  source: string;
}

export interface HealthProvider {
  readonly supported: boolean;
  readonly description: string;
  check(): Promise<HealthStatus>;
}

export interface DeploymentStatus {
  status: 'deployed' | 'pending' | 'failed' | 'unknown';
  environment?: string;
  version?: string;
  checkedAt: Date;
  details?: Record<string, unknown>;
  source: string;
}

export interface DeploymentProvider {
  readonly supported: boolean;
  readonly description: string;
  status(): Promise<DeploymentStatus>;
}

export interface BackupStatus {
  status: 'ok' | 'stale' | 'missing' | 'unknown';
  lastBackupAt?: Date;
  checkedAt: Date;
  details?: Record<string, unknown>;
  source: string;
}

export interface BackupProvider {
  readonly supported: boolean;
  readonly description: string;
  status(): Promise<BackupStatus>;
}

export interface OperationalStatus {
  health: HealthStatus;
  deployment: DeploymentStatus;
  backup: BackupStatus;
  checkedAt: Date;
  source: string;
}

export interface OperationalProvider {
  readonly supported: boolean;
  readonly description: string;
  status(): Promise<OperationalStatus>;
}

// ==========================================
// Default boundaries (no fake infrastructure)
// ==========================================

export const DEFAULT_HEALTH_PROVIDER: HealthProvider = {
  supported: false,
  description:
    'No repository health provider is currently wired into the ELEVA module. Connect a real provider via this boundary; do not fabricate health results.',
  async check() {
    return {
      status: 'unknown',
      checkedAt: new Date(),
      source: 'default-health-provider',
      details: { unavailable: true },
    };
  },
};

export const DEFAULT_DEPLOYMENT_PROVIDER: DeploymentProvider = {
  supported: false,
  description:
    'No repository deployment provider is currently wired into the ELEVA module. Connect a real provider via this boundary; do not fabricate deployment results.',
  async status() {
    return {
      status: 'unknown',
      checkedAt: new Date(),
      source: 'default-deployment-provider',
      details: { unavailable: true },
    };
  },
};

export const DEFAULT_BACKUP_PROVIDER: BackupProvider = {
  supported: false,
  description:
    'No repository backup provider is currently wired into the ELEVA module. Connect a real provider via this boundary; do not fabricate backup results.',
  async status() {
    return {
      status: 'unknown',
      checkedAt: new Date(),
      source: 'default-backup-provider',
      details: { unavailable: true },
    };
  },
};

@Injectable()
export class ElevaOperationalService {
  private readonly logger = new Logger(ElevaOperationalService.name);
  private healthProvider: HealthProvider = DEFAULT_HEALTH_PROVIDER;
  private deploymentProvider: DeploymentProvider = DEFAULT_DEPLOYMENT_PROVIDER;
  private backupProvider: BackupProvider = DEFAULT_BACKUP_PROVIDER;

  constructor(@Optional() private readonly auditService?: AuditService) {}

  setHealthProvider(provider: HealthProvider): void {
    this.healthProvider = provider;
    this.logger.log(`Health provider set. supported=${provider.supported}`);
  }

  setDeploymentProvider(provider: DeploymentProvider): void {
    this.deploymentProvider = provider;
    this.logger.log(`Deployment provider set. supported=${provider.supported}`);
  }

  setBackupProvider(provider: BackupProvider): void {
    this.backupProvider = provider;
    this.logger.log(`Backup provider set. supported=${provider.supported}`);
  }

  async getHealth(): Promise<HealthStatus> {
    const start = Date.now();
    const result = await this.healthProvider.check();
    this.emitAudit('AGENT.OPERATIONAL.HEALTH', 'ElevaOperational', undefined, {
      status: result.status,
      source: result.source,
      latencyMs: Date.now() - start,
    });
    return result;
  }

  async getDeployment(): Promise<DeploymentStatus> {
    const start = Date.now();
    const result = await this.deploymentProvider.status();
    this.emitAudit('AGENT.OPERATIONAL.DEPLOYMENT', 'ElevaOperational', undefined, {
      status: result.status,
      source: result.source,
      latencyMs: Date.now() - start,
    });
    return result;
  }

  async getBackup(): Promise<BackupStatus> {
    const start = Date.now();
    const result = await this.backupProvider.status();
    this.emitAudit('AGENT.OPERATIONAL.BACKUP', 'ElevaOperational', undefined, {
      status: result.status,
      source: result.source,
      latencyMs: Date.now() - start,
    });
    return result;
  }

  async getOperationalStatus(): Promise<OperationalStatus> {
    const start = Date.now();
    const [health, deployment, backup] = await Promise.all([
      this.healthProvider.check(),
      this.deploymentProvider.status(),
      this.backupProvider.status(),
    ]);
    const result: OperationalStatus = {
      health,
      deployment,
      backup,
      checkedAt: new Date(),
      source: 'eleva-operational-composite',
    };
    this.emitAudit('AGENT.OPERATIONAL.STATUS', 'ElevaOperational', undefined, {
      healthStatus: health.status,
      deploymentStatus: deployment.status,
      backupStatus: backup.status,
      latencyMs: Date.now() - start,
    });
    return result;
  }

  private emitAudit(action: string, entityName: string, entityId: string | undefined, values: Record<string, unknown>): void {
    if (!this.auditService?.log) {
      return;
    }
    this.auditService
      .log({
        tenantId: null,
        userId: null,
        action,
        entityName,
        entityId: entityId ?? null,
        oldValues: null,
        newValues: values,
        ipAddress: 'system',
        userAgent: 'eleva-operational',
      })
      .catch((error: unknown) =>
        this.logger.error(`Failed to emit ELEVA operational audit log: ${error instanceof Error ? error.message : 'unknown'}`),
      );
  }
}
