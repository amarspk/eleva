import { IsString, IsNotEmpty, Length, IsOptional, IsNumber, Min, Max } from 'class-validator';

/**
 * AUDIT-008 — partial update for PUT /api/v1/restaurants/:id.
 *
 * Only the existing Restaurant columns. `tenantId` is never accepted
 * (forbidNonWhitelisted) so a caller cannot re-parent a brand.
 */
export class UpdateRestaurantRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage?: number;
}
