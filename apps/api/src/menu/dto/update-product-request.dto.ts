import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsInt,
  Length,
  IsUUID,
  IsBoolean,
} from 'class-validator';

/**
 * Partial update payload for `PUT /api/v1/menu/products/:id` (AUDIT-006).
 *
 * Every field is optional — only the supplied keys are written, mirroring the
 * `UpdateUserRequestDto` convention established by AUDIT-004. The global
 * `ValidationPipe` runs with `whitelist: true` + `forbidNonWhitelisted: true`
 * (main.ts), so unknown keys are rejected with 400 rather than silently
 * ignored. Notably this makes `tenantId`, `id` and `deletedAt` unwritable
 * through this endpoint: a client cannot resurrect or re-home a record by
 * smuggling those fields into the body.
 *
 * `categoryId` uses `@IsUUID('4')` for the reason established in AUDIT-002: an
 * `@IsString()` id reaches a `@db.Uuid` column and surfaces as an unhandled
 * HTTP 500 (`Inconsistent column data: Error creating UUID`).
 */
export class UpdateProductRequestDto {
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  basePrice?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  calories?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  preparationTime?: number;
}
