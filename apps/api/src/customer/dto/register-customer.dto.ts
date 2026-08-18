import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';

/**
 * Public customer self-service registration (Phase 4 — Customer Account).
 *
 * tenantId is resolved by TenantContextMiddleware — never accepted from the
 * client payload. `password` is required for self-service accounts and hashed
 * with Argon2id before persistence.
 */
export class RegisterCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phoneNumber?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
