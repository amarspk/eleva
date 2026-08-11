import { IsString, IsNotEmpty, IsEnum, IsOptional, IsUrl, IsIn, IsUUID } from 'class-validator';
import { PaymentMethodType } from '@zayjar/types';

export class CreateWalletPaymentRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  orderId!: string;

  @IsEnum(PaymentMethodType)
  @IsNotEmpty()
  paymentMethod!: PaymentMethodType;

  @IsString()
  @IsOptional()
  @IsIn(['apple_pay', 'google_pay', 'knet', 'benefit', 'mada', 'cash', 'credit_card'])
  walletType?: string;

  // AUDIT-002 Finding #6: the client-supplied `amount` field has been REMOVED.
  // It was required by the DTO but never read by any production code — the
  // charge amount is always derived server-side from `order.total`
  // (wallet.service.ts). Keeping the field would misrepresent control to API
  // clients and invite a future regression; `forbidNonWhitelisted: true` now
  // rejects any payload that still sends `amount` (HTTP 400).

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsUrl()
  @IsOptional()
  successUrl?: string;

  @IsUrl()
  @IsOptional()
  cancelUrl?: string;
}
