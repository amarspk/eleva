import { Controller, Get, UseGuards, HttpCode, HttpStatus, Req, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/request.types';

@Controller('api/v1/admin/tenants')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /api/v1/admin/tenants/metrics
   * Per DOC-003 3.10.1
   * Auth: Bearer, Permission: platform:read (PLATFORM_OWNER only)
   */
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  async getMetrics(@Req() req: AuthenticatedRequest): Promise<{
    totalTenants: number;
    activeSubscriptions: number;
    mrrUSD: number;
    arrUSD: number;
    systemLoadAverage: number;
    databaseConnectionsCount: number;
  }> {
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const roles = user.roles || [];
    if (!roles.includes('PLATFORM_OWNER')) {
      throw new ForbiddenException('Access Denied: platform:read permission requires PLATFORM_OWNER role');
    }

    return this.adminService.getTenantsMetrics();
  }
}
