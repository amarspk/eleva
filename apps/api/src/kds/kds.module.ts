import { Module, forwardRef } from '@nestjs/common';
import { KdsGateway } from './kds.gateway';
import { KdsService } from './kds.service';
import { KdsController } from './kds.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [KdsController],
  providers: [KdsGateway, KdsService],
  exports: [KdsGateway, KdsService],
})
export class KdsModule {}
