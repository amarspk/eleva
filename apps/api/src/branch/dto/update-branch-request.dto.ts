import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  IsNumber,
  IsObject,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

/**
 * Partial update payload for `PUT /api/v1/branches/:id` (AUDIT-007).
 *
 * `restaurantId` is deliberately NOT updatable — moving a branch between
 * restaurants would orphan its tables and rewrite the parentage of historical
 * orders' reporting hierarchy.
 *
 * Latitude/longitude are range-checked here because the column is
 * `Decimal(9,6)`: an out-of-range magnitude (for example 1e9) overflows the
 * column precision and would surface as an unhandled database error rather
 * than a 400.
 */
export class UpdateBranchRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  address?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  @IsOptional()
  phoneNumber?: string;

  @IsObject()
  @IsNotEmpty()
  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
