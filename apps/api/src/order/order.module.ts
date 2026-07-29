import { Module, forwardRef } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { PublicOrderController } from './public-order.controller';
import { AuthModule } from '../auth/auth.module';
import { KdsModule } from '../kds/kds.module';
import { WebhookModule } from '../webhook/webhook.module';
import { NotificationModule } from '../notification/notification.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';

@Module({
  imports: [AuthModule, forwardRef(() => KdsModule), forwardRef(() => WebhookModule), NotificationModule, RateLimitModule],
  controllers: [OrderController, PublicOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
