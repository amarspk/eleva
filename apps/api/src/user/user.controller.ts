import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserService, UserResponse, ActorContext } from './user.service';
import { CreateUserRequestDto } from './dto/create-user-request.dto';
import { UpdateUserRequestDto } from './dto/update-user-request.dto';
import { AssignRolesRequestDto } from './dto/assign-roles-request.dto';
import { AssignBranchesRequestDto } from './dto/assign-branches-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard } from '../auth/guards/rbac-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuthenticatedRequest } from '../common/types/request.types';
import { OptionalUuidPipe } from '../common/pipes/optional-uuid.pipe';

/**
 * Staff user management endpoints (AUDIT-004).
 *
 * Authorization model — two independent layers, both required:
 *  1. `JwtAuthGuard` establishes a signature-verified identity whose tenant
 *     claim has already been reconciled against the request context by
 *     `JwtStrategy` (AUTHZ-001).
 *  2. `RbacPermissionGuard` + `@RequirePermission(action, 'User')` evaluates
 *     the caller's CASL ability. `User` is an existing subject in
 *     `CaslAbilityFactory` and is already wired into the guard's tenant
 *     repository registry, so `read`/`update`/`delete` on a `:id` route are
 *     re-checked against the real database row under tenant scope.
 *
 * The tenant is always taken from `req.user.tenantId` (verified JWT), never
 * from a body field or header.
 */
@Controller('api/v1/users')
@UseGuards(JwtAuthGuard, RbacPermissionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  private tenantOf(req: AuthenticatedRequest): string {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Access denied: Missing valid tenant context.');
    }
    return tenantId;
  }

  /**
   * The acting caller, taken from the signature-verified JWT. Drives the
   * privilege-escalation gate (a caller may only grant roles they hold) and
   * the self-deletion guard.
   */
  private actorOf(req: AuthenticatedRequest): ActorContext {
    return {
      id: req.user?.id ?? '',
      roles: req.user?.roles ?? [],
      permissions: req.user?.permissions ?? [],
    };
  }

  /**
   * POST /api/v1/users — create a staff user (optionally with roles/branches).
   */
  @Post()
  @RequirePermission('create', 'User')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Body() dto: CreateUserRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponse> {
    return this.userService.createUser(dto, this.tenantOf(req), this.actorOf(req));
  }

  /**
   * GET /api/v1/users — list staff users for the caller's tenant.
   */
  @Get()
  @RequirePermission('read', 'User')
  @HttpCode(HttpStatus.OK)
  async listUsers(
    @Req() req: AuthenticatedRequest,
    @Query('isActive') isActive?: string,
    @Query('branchId', OptionalUuidPipe) branchId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<UserResponse[]> {
    const filters: {
      isActive?: boolean;
      branchId?: string;
      limit?: number;
      offset?: number;
    } = {};
    if (isActive === 'true') {
      filters.isActive = true;
    }
    if (isActive === 'false') {
      filters.isActive = false;
    }
    if (branchId) {
      filters.branchId = branchId;
    }

    // Query strings are always strings; parse defensively and ignore
    // non-numeric input rather than passing NaN into Prisma `take`/`skip`
    // (which throws). The service clamps the final values.
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    if (Number.isFinite(parsedLimit)) {
      filters.limit = parsedLimit;
    }
    const parsedOffset = Number.parseInt(offset ?? '', 10);
    if (Number.isFinite(parsedOffset)) {
      filters.offset = parsedOffset;
    }

    return this.userService.findAll(this.tenantOf(req), filters);
  }

  /**
   * GET /api/v1/users/:id — fetch a single staff user.
   */
  @Get(':id')
  @RequirePermission('read', 'User')
  @HttpCode(HttpStatus.OK)
  async getUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponse> {
    return this.userService.findOne(id, this.tenantOf(req));
  }

  /**
   * PUT /api/v1/users/:id — partial update (only supplied fields change).
   */
  @Put(':id')
  @RequirePermission('update', 'User')
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponse> {
    return this.userService.updateUser(id, dto, this.tenantOf(req), this.actorOf(req));
  }

  /**
   * PUT /api/v1/users/:id/roles — replace the user's role set.
   */
  @Put(':id/roles')
  @RequirePermission('update', 'User')
  @HttpCode(HttpStatus.OK)
  async assignRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignRolesRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponse> {
    return this.userService.assignRoles(id, dto.roles, this.tenantOf(req), this.actorOf(req));
  }

  /**
   * PUT /api/v1/users/:id/branches — replace the user's branch scope
   * (DOC-005 §4.2).
   */
  @Put(':id/branches')
  @RequirePermission('update', 'User')
  @HttpCode(HttpStatus.OK)
  async assignBranches(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignBranchesRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserResponse> {
    return this.userService.assignBranches(id, dto.branchIds, this.tenantOf(req), this.actorOf(req));
  }

  /**
   * DELETE /api/v1/users/:id — soft-delete + deactivate.
   */
  @Delete(':id')
  @RequirePermission('delete', 'User')
  @HttpCode(HttpStatus.OK)
  async deleteUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; deleted: true }> {
    return this.userService.deleteUser(id, this.tenantOf(req), this.actorOf(req));
  }
}
