import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Customer self-service profile update (Phase 4 — Customer Account).
 *
 * Email is the account identifier and is intentionally not editable through
 * this surface (changing it would require re-verification infrastructure that
 * does not exist for customers).
 */
export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phoneNumber?: string;
}
