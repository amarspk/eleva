import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { CustomerAuthGuard } from './guards/customer-auth.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * AUDIT-014 (DEFECT-H): `AuthModule` is imported so `RbacPermissionGuard` can
 * resolve `CaslAbilityFactory` and so `CustomerAuthService` can reuse
 * `AuthService` (Argon2id hashing) + `JwtModule` for customer tokens.
 * Same pattern as `MenuModule` / `BranchModule`.
 *
 * Phase 4 — Customer Account & Profile: the customer self-service surface
 * (register/login/me/orders) lives here, fully separate from staff RBAC.
 */
@Module({
  imports: [AuthModule],
  controllers: [CustomerController, CustomerAuthController],
  providers: [CustomerService, CustomerAuthService, CustomerJwtStrategy, CustomerAuthGuard],
  exports: [CustomerService],
})
export class CustomerModule {}
