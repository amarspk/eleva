import { Controller, Get, Param } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ElevaService } from './eleva.service';

export interface AgentStatusResponse {
  status: string;
  activeCapability: string | null;
  updatedAt: string;
}

export interface AgentCapabilityResponse {
  name: string;
  description: string;
  enabled: boolean;
}

export interface AgentPermissionResponse {
  action: string;
  resource: string;
  description: string;
}

export interface AgentApprovalResponse {
  actionId: string;
  approved: boolean;
}

@Controller('agent')
export class AgentController {
  constructor(private readonly elevaService: ElevaService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Agent')
  getStatus(): AgentStatusResponse {
    const state = this.elevaService.getStatus();
    return {
      status: state.status,
      activeCapability: state.activeCapability,
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  @Get('capabilities')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Agent')
  getCapabilities(): AgentCapabilityResponse[] {
    return this.elevaService.getCapabilities();
  }

  @Get('permissions')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Agent')
  getPermissions(): AgentPermissionResponse[] {
    return this.elevaService.getPermissions();
  }

  @Get('approvals/:actionId')
  @UseGuards(JwtAuthGuard, RbacPermissionGuard)
  @RequirePermission('read', 'Agent')
  getApproval(@Param('actionId') actionId: string): AgentApprovalResponse {
    return {
      actionId,
      approved: this.elevaService.isApproved(actionId),
    };
  }
}
