import { Module } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * AUDIT-014 DEFECT-L. `AuthModule` is imported so `RbacPermissionGuard` can
 * resolve `CaslAbilityFactory` (omitting it is a boot-time DI failure — the
 * mistake made and caught during the Customers work).
 */
@Module({
  imports: [AuthModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
