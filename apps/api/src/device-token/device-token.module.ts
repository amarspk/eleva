import { Module } from '@nestjs/common';
import { DeviceTokenService } from './device-token.service';
import { DeviceTokenController } from './device-token.controller';
import { FcmService } from '../fcm/fcm.service';

@Module({
  controllers: [DeviceTokenController],
  providers: [DeviceTokenService, FcmService],
  exports: [DeviceTokenService],
})
export class DeviceTokenModule {}
