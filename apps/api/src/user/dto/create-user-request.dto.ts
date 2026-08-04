import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Staff-user creation payload (AUDIT-004).
 *
 * `tenantId` is deliberately absent: it is resolved server-side from the
 * authenticated caller's verified JWT tenant context, never accepted from the
 * client. Accepting it here would reopen the cross-tenant insertion vector
 * closed by AUTHZ-001.
 */
export class CreateUserRequestDto {
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
  @MaxLength(255)
  email!: string;

  /**
   * Minimum length mirrors the platform's existing onboarding contract.
   * Hashed with Argon2id via AuthService before persistence — the plaintext is
   * never stored, logged, or echoed back in any response.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phoneNumber?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Role names (e.g. `CASHIER`) resolved to this tenant's role rows. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roles?: string[];

  /** Branch IDs to scope this user to (DOC-005 §4.2). Validated per tenant. */
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  branchIds?: string[];
}
