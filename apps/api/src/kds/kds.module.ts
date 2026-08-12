import { Module, forwardRef } from '@nestjs/common';
import { KdsGateway } from './kds.gateway';
import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // forwardRef: KdsModule sits inside the module cycle AuthModule ->
  // NotificationModule -> KdsModule -> AuthModule (the AuthModule edge was
  // added by AUDIT-005). Without it, KdsModule can capture an undefined
  // AuthModule binding when AuthModule is evaluated first.
  imports: [forwardRef(() => AuthModule)],
  controllers: [KdsController],
  providers: [KdsGateway, KdsService],
  exports: [KdsGateway, KdsService],
})
export class KdsModule {}
