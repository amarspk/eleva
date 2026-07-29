import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';
import { PublicMenuController } from './public-menu.controller';
import { PublicMenuService } from './public-menu.service';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';

@Module({
  imports: [AuthModule, SubscriptionModule, RateLimitModule],
  controllers: [MenuController, PublicMenuController],
  providers: [MenuService, PublicMenuService],
  exports: [MenuService],
})
export class MenuModule {}
