import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional, IsUrl, IsIn, IsUUID } from 'class-validator';
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

  @IsNumber()
  @Min(0.01)
  amount!: number;

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
