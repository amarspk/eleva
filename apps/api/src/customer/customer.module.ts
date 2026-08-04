import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * AUDIT-014 (DEFECT-H): `AuthModule` is imported so `RbacPermissionGuard` can
 * resolve `CaslAbilityFactory`. Without it the application fails to boot with
 * "Nest can't resolve dependencies of the RbacPermissionGuard (Reflector, ?)"
 * — caught at runtime immediately after adding the guards to the controller.
 * Same pattern as `MenuModule` / `BranchModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
