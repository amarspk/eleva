import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested, IsInt, Min, ArrayNotEmpty, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType, PaymentMethodType } from '@zayjar/types';

export class OrderAddonSelectionDto {
  @IsUUID('4')
  @IsNotEmpty()
  addonItemId!: string;
}

export class OrderItemSelectionDto {
  @IsUUID('4')
  @IsNotEmpty()
  productId!: string;

  @IsUUID('4')
  @IsOptional()
  sizeId?: string;

  @IsUUID('4')
  @IsOptional()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderAddonSelectionDto)
  addons?: OrderAddonSelectionDto[];
}

export class CreateOrderRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  branchId!: string;

  @IsUUID('4')
  @IsOptional()
  tableId?: string;

  /**
   * Cryptographic QR table credential (DOC-005 4.6). Mandatory on the public
   * guest checkout surface (POST /api/v1/public/orders/checkout); unused on
   * the authenticated staff checkout path.
   */
  @IsString()
  @IsOptional()
  qrCodeToken?: string;

  @IsEnum(OrderType)
  @IsNotEmpty()
  type!: OrderType;

  @IsString()
  @IsOptional()
  specialNotes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemSelectionDto)
  items!: OrderItemSelectionDto[];

  @IsEnum(PaymentMethodType)
  @IsNotEmpty()
  paymentMethod!: PaymentMethodType;

  /**
   * Optional discount code (Sprint 2 Task 4 — discount engine). Server-side
   * validated against the tenant's active discounts; invalid/expired/limited
   * codes reject the checkout with a uniform error. Normalized (trim + upper)
   * by the order service before lookup.
   */
  @IsString()
  @IsOptional()
  discountCode?: string;

  @IsOptional()
  isPreorder?: boolean;

  @IsString()
  @IsOptional()
  scheduledAt?: string;
}
