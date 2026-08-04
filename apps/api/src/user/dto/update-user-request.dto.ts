import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Staff-user update payload (AUDIT-004). Every field is optional — only the
 * supplied keys are applied (partial update).
 *
 * Deliberately NOT updatable here:
 * - `tenantId` — reassigning a user across tenants is never a valid operation.
 * - `mfaSecret` / `mfaEnabled` — owned by the existing MFA enrolment flow
 *   (`POST /auth/mfa/enable` + `/verify`); an admin must not be able to
 *   silently disable another user's second factor through a generic update.
 *
 * `roles`/`branchIds` are full replacements (set semantics) when present, and
 * left untouched when omitted, so a caller updating only `firstName` cannot
 * accidentally strip a user's access.
 */
export class UpdateUserRequestDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  /** When present, re-hashed with Argon2id; the plaintext is never persisted. */
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phoneNumber?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roles?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  branchIds?: string[];
}
