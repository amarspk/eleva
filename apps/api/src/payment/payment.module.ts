import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PaymentController } from './payment.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AUDIT-002 Finding #5 (RBAC): RbacPermissionGuard + CaslAbilityFactory are
  // provided/exported by AuthModule (same wiring as OrderModule); without this
  // import Nest cannot resolve the guard and the app fails to boot.
  imports: [AuthModule],
  controllers: [PaymentController],
  providers: [WalletService],
  exports: [WalletService],
})
export class PaymentModule {}
