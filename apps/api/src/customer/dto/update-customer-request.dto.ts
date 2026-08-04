import { IsString, IsNotEmpty, IsEmail, IsOptional, IsInt, Min, Length } from 'class-validator';

/**
 * Partial update payload for `PUT /api/v1/customers/:id` (AUDIT-014).
 *
 * Every field optional — only supplied keys are written. The global
 * ValidationPipe runs `whitelist: true` + `forbidNonWhitelisted: true`, so
 * `tenantId`, `id` and `deletedAt` cannot be smuggled through the body.
 *
 * `loyaltyPoints` is writable because staff need to correct balances, but it is
 * bounded at >= 0 so a negative balance can never be stored.
 */
export class UpdateCustomerRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsNotEmpty()
  @Length(1, 255)
  @IsOptional()
  email?: string;

  @IsString()
  @Length(1, 50)
  @IsOptional()
  phoneNumber?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  loyaltyPoints?: number;
}
