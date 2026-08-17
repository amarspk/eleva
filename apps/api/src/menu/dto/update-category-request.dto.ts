import { IsString, IsNotEmpty, IsInt, Min, Length, IsOptional, IsBoolean, MaxLength } from 'class-validator';

/**
 * Partial update payload for `PUT /api/v1/menu/categories/:id` (AUDIT-006).
 *
 * `restaurantId` is deliberately NOT updatable: re-parenting a category to a
 * different restaurant would silently move every product under it and could be
 * used to bridge two restaurants inside one tenant. Creating a new category is
 * the supported path.
 */
export class UpdateCategoryRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /**
   * Real category image (Phase 4 P1). Pass `null` to remove the image.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;
}
