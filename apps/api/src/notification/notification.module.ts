import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { DispatchService } from './dispatch/dispatch.service';
import { DeviceTokenModule } from '../device-token/device-token.module';
import { WebhookModule } from '../webhook/webhook.module';
import { KdsModule } from '../kds/kds.module';
import { QueueModule } from '../common/queue/queue.module';

@Module({
  // forwardRef on KdsModule: same AUDIT-005 module cycle as in auth.module —
  // protects the reverse load order (KdsModule evaluated before AuthModule).
  imports: [DeviceTokenModule, WebhookModule, forwardRef(() => KdsModule), QueueModule],
  providers: [EmailService, SmsService, DispatchService],
  exports: [EmailService, SmsService, DispatchService],
})
export class NotificationModule {}
