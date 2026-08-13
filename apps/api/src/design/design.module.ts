import { Module } from '@nestjs/common';
import { DesignService } from './design.service';
import { DesignController } from './design.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DesignController],
  providers: [DesignService],
  exports: [DesignService],
})
export class DesignModule {}
