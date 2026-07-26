import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingNotificationListener } from './listeners/billing-notification.listener';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [BillingController],
  providers: [BillingService, BillingNotificationListener],
  exports: [BillingService],
})
export class BillingModule {}
