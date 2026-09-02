import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ElevaOperationalService, HealthStatus, DeploymentStatus, BackupStatus } from './eleva.operations';

export interface OperationalControllerHealthResponse {
  source: string;
  status: HealthStatus['status'];
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface OperationalControllerDeploymentResponse {
  source: string;
  status: DeploymentStatus['status'];
  checkedAt: string;
  environment?: string;
  version?: string;
  details?: Record<string, unknown>;
}

export interface OperationalControllerBackupResponse {
  source: string;
  status: BackupStatus['status'];
  checkedAt: string;
  lastBackupAt?: string;
  details?: Record<string, unknown>;
}

export interface OperationalControllerStatusResponse {
  source: string;
  checkedAt: string;
  health: OperationalControllerHealthResponse;
  deployment: OperationalControllerDeploymentResponse;
  backup: OperationalControllerBackupResponse;
}

@Controller('eleva-office/operational')
export class ElevaOperationalController {
  constructor(private readonly operationalService: ElevaOperationalService) {}

  @Get('health')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getHealth(): Promise<OperationalControllerHealthResponse> {
    const result = await this.operationalService.getHealth();
    return this.mapHealth(result);
  }

  @Get('deployment')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getDeployment(): Promise<OperationalControllerDeploymentResponse> {
    const result = await this.operationalService.getDeployment();
    return this.mapDeployment(result);
  }

  @Get('backup')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getBackup(): Promise<OperationalControllerBackupResponse> {
    const result = await this.operationalService.getBackup();
    return this.mapBackup(result);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'agent')
  async getStatus(): Promise<OperationalControllerStatusResponse> {
    const result = await this.operationalService.getOperationalStatus();
    return {
      source: result.source,
      checkedAt: result.checkedAt.toISOString(),
      health: this.mapHealth(result.health),
      deployment: this.mapDeployment(result.deployment),
      backup: this.mapBackup(result.backup),
    };
  }

  private mapHealth(result: HealthStatus): OperationalControllerHealthResponse {
    return {
      source: result.source,
      status: result.status,
      checkedAt: result.checkedAt.toISOString(),
      details: result.details,
    };
  }

  private mapDeployment(result: DeploymentStatus): OperationalControllerDeploymentResponse {
    return {
      source: result.source,
      status: result.status,
      checkedAt: result.checkedAt.toISOString(),
      environment: result.environment,
      version: result.version,
      details: result.details,
    };
  }

  private mapBackup(result: BackupStatus): OperationalControllerBackupResponse {
    return {
      source: result.source,
      status: result.status,
      checkedAt: result.checkedAt.toISOString(),
      lastBackupAt: result.lastBackupAt?.toISOString(),
      details: result.details,
    };
  }
}
