import { Module } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';

/**
 * Restaurant brand reads (AUDIT-014) + writes (AUDIT-008).
 * AuthModule supplies CaslAbilityFactory; SubscriptionModule supplies
 * SubscriptionService for the existing maxRestaurants plan limit.
 */
@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
