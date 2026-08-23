import { Module } from '@nestjs/common';
import { DiscountAdminService } from './discount-admin.service';
import { DiscountController } from './discount.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DiscountController],
  providers: [DiscountAdminService],
  exports: [DiscountAdminService],
})
export class DiscountModule {}
