import { Injectable, ConflictException, Logger, NotFoundException, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { CreateTenantRequestDto } from './dto/create-tenant-request.dto';
import { UpdateTenantRequestDto } from './dto/update-tenant-request.dto';
import { AuthService } from '../auth/auth.service';
import { prisma, prismaRead } from '@zayjar/db';
import { EmailService } from '../notification/email/email.service';

@Injectable()
export class TenantService {
  private readonly logger = new Logger('TenantService');

  constructor(
    private readonly authService: AuthService,
    @Optional() @Inject(EmailService) private readonly emailService?: EmailService,
  ) {}

  /**
   * Orchestrates the complete onboarding transaction for a new restaurant merchant.
   * Maps exactly to standard workflows defined in DOC-005.md.
   */
  async onboard(dto: CreateTenantRequestDto): Promise<Record<string, unknown>> {
    this.logger.log(`Initiating workspace onboarding transaction for subdomain: [${dto.subdomain}]`);

    // 1. Verify subdomain and email availability
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: dto.subdomain },
    });
    if (existingTenant) {
      throw new ConflictException('The requested subdomain is already registered.');
    }

    // 2. Hash the owner's password securely using Argon2id Auth Service
    const hashedPassword = await this.authService.hashPassword(dto.ownerPassword);

    // 3. Execute the complete onboarding scope inside a single relational database transaction
    return prisma.$transaction(async (tx) => {
      // A. Create Tenant profile
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          subdomain: dto.subdomain,
          status: 'TRIALING',
        },
      });

      // B. Provision default 14-day free subscription
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: dto.planId,
          status: 'TRIALING',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 Days
        },
      });

      // C. Register default Restaurant Owner user account
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          firstName: dto.ownerFirstName,
          lastName: dto.ownerLastName,
          email: dto.ownerEmail.toLowerCase(),
          passwordHash: hashedPassword,
        },
      });

      // D. Assign the RESTAURANT_OWNER role
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'RESTAURANT_OWNER',
          displayName: 'Restaurant Owner',
        },
      });

      await tx.userRole.create({
        data: {
          userId: owner.id,
          roleId: ownerRole.id,
        },
      });

      // E. Create default Restaurant Brand
      const restaurant = await tx.restaurant.create({
        data: {
          tenantId: tenant.id,
          name: dto.companyName,
        },
      });

      // F. Create default Main Office physical branch
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: 'Main Branch',
          address: 'Default Branch Address',
          phoneNumber: '+15550199',
          operatingHours: {
            monday: { open: '09:00', close: '22:00', closed: false },
            tuesday: { open: '09:00', close: '22:00', closed: false },
            wednesday: { open: '09:00', close: '22:00', closed: false },
            thursday: { open: '09:00', close: '22:00', closed: false },
            friday: { open: '09:00', close: '23:00', closed: false },
            saturday: { open: '10:00', close: '23:00', closed: false },
            sunday: { open: '10:00', close: '21:00', closed: false },
          },
        },
      });

      this.logger.log(`Onboarding transaction completed successfully. Tenant UUID: [${tenant.id}]`);

      const result = {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          status: tenant.status,
        },
        owner: {
          id: owner.id,
          email: owner.email,
        },
        branch: {
          id: branch.id,
          name: branch.name,
        }
      };

      // Async welcome email dispatch per DOC-008 7.2 (fire-and-forget to not block onboarding)
      if (this.emailService) {
        this.emailService
          .sendWelcomeEmail(dto.ownerEmail, {
            companyName: dto.companyName,
            ownerFirstName: dto.ownerFirstName,
            ownerLastName: dto.ownerLastName,
            subdomain: dto.subdomain,
            status: 'TRIALING',
          })
          .catch((err) => {
            this.logger.warn(`Failed to send welcome email to [${dto.ownerEmail}]: ${(err as Error).message}`);
          });
      }

      return result;
    });
  }

  /**
   * Returns tenant branding and profile per DOC-003 3.3.2
   * Uses prismaRead for read-only queries (DOC-001 §1.5 read replica routing)
   * Public read allowed, but if authenticated user is not PLATFORM_OWNER, enforce tenant isolation
   */
  async getTenantById(id: string, requester?: { tenantId?: string | null; roles?: string[] }): Promise<{
    id: string;
    name: string;
    subdomain: string;
    customDomain: string | null;
    status: string;
    branding: Record<string, unknown>;
  }> {
    const tenant = await prismaRead.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID [${id}] not found.`);
    }

    // Enforce isolation for non-platform owners
    if (requester && requester.tenantId && !requester.roles?.includes('PLATFORM_OWNER')) {
      if (requester.tenantId !== id) {
        throw new ForbiddenException('Access denied: Cannot access another tenant context');
      }
    }

    // Merge static branding fields with JSONB dynamic branding (DOC-001 §1.5)
    const dynamicBranding = (tenant.branding as Record<string, unknown>) || {};

    return {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      customDomain: tenant.customDomain,
      status: tenant.status,
      branding: {
        logoUrl: tenant.logoUrl,
        bannerUrl: tenant.bannerUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        ...dynamicBranding,
      },
    };
  }

  /**
   * Modifies tenant branding per DOC-003 3.3.3
   * Requires RESTAURANT_OWNER, tenant isolation enforced
   * Supports both static branding fields and JSONB dynamic branding (DOC-001 §1.5)
   */
  async updateTenant(id: string, dto: UpdateTenantRequestDto, requester?: { tenantId?: string | null; roles?: string[] }): Promise<{
    id: string;
    name: string;
    subdomain: string;
    customDomain: string | null;
    status: string;
    branding: Record<string, unknown>;
    updatedAt: Date;
  }> {
    const existing = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Tenant with ID [${id}] not found.`);
    }

    // Enforce tenant isolation: requester must belong to same tenant unless platform owner
    if (requester && requester.tenantId && !requester.roles?.includes('PLATFORM_OWNER')) {
      if (requester.tenantId !== id) {
        throw new ForbiddenException('Access denied: Cannot modify another tenant');
      }
    }

    // If customDomain provided, ensure uniqueness
    if (dto.customDomain) {
      const domainConflict = await prisma.tenant.findUnique({
        where: { customDomain: dto.customDomain },
      });
      if (domainConflict && domainConflict.id !== id) {
        throw new ConflictException(`Custom domain [${dto.customDomain}] is already registered.`);
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.name) {data.name = dto.name;}
    if (dto.customDomain !== undefined) {data.customDomain = dto.customDomain;}
    if (dto.branding) {
      if (dto.branding.logoUrl !== undefined) {data.logoUrl = dto.branding.logoUrl;}
      if (dto.branding.bannerUrl !== undefined) {data.bannerUrl = dto.branding.bannerUrl;}
      if (dto.branding.primaryColor !== undefined) {data.primaryColor = dto.branding.primaryColor;}
      if (dto.branding.secondaryColor !== undefined) {data.secondaryColor = dto.branding.secondaryColor;}
    }

    // Merge dynamic branding keys into JSONB column (DOC-001 §1.5)
    if (dto.branding?.dynamic) {
      const existingBranding = (existing.branding as Record<string, unknown>) || {};
      data.branding = { ...existingBranding, ...dto.branding.dynamic };
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data,
    });

    const dynamicBranding = (updated.branding as Record<string, unknown>) || {};

    return {
      id: updated.id,
      name: updated.name,
      subdomain: updated.subdomain,
      customDomain: updated.customDomain,
      status: updated.status,
      branding: {
        logoUrl: updated.logoUrl,
        bannerUrl: updated.bannerUrl,
        primaryColor: updated.primaryColor,
        secondaryColor: updated.secondaryColor,
        ...dynamicBranding,
      },
      updatedAt: updated.updatedAt,
    };
  }
}
