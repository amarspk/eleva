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
 * AUDIT-009 — partial update. usageCount is never accepted.
 */
export class UpdateDiscountRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(DiscountType)
  type?: DiscountType;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(99999999.99)
  value?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;
}
