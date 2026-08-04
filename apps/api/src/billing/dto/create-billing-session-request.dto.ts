import { IsNotEmpty, IsUrl, IsUUID } from 'class-validator';

export class CreateBillingSessionRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  planId!: string;

  @IsUrl()
  @IsNotEmpty()
  successUrl!: string;

  @IsUrl()
  @IsNotEmpty()
  cancelUrl!: string;
}
