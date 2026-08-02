import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested, IsInt, Min, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType, PaymentMethodType } from '@zayjar/types';

export class OrderAddonSelectionDto {
  @IsString()
  @IsNotEmpty()
  addonItemId!: string;
}

export class OrderItemSelectionDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  sizeId?: string;

  @IsString()
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
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
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
}
