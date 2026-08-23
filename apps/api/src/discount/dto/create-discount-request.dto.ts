import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDateString,
} from 'class-validator';
import { DiscountType } from '@zayjar/db';

/**
 * AUDIT-009 — create payload. Fields are exactly the Discount columns used
 * by the checkout engine (code, type PERCENTAGE|FIXED_AMOUNT, value, active,
 * validFrom, validTo, usageLimit). usageCount is server-owned.
 */
export class CreateDiscountRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DiscountType)
  type!: DiscountType;

  @IsNumber()
  @Min(0.01)
  @Max(99999999.99)
  value!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;
}
