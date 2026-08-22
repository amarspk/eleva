import { IsString, IsNotEmpty, Length, IsOptional, IsNumber, Min, Max } from 'class-validator';

/**
 * AUDIT-008 — create payload for POST /api/v1/restaurants.
 *
 * Fields are exactly the Restaurant columns already written by tenant
 * onboarding (`tenant.service.ts`) and the schema (`name`, `currency`,
 * `timezone`, `taxPercentage`). No extra brand attributes.
 */
export class CreateRestaurantRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name!: string;

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
