import { IsString, IsNotEmpty, IsInt, Min, Length, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateCategoryRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  restaurantId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;

  /**
   * Real category image (Phase 4 P1). A URL to a media-library asset or any
   * http(s) image; nullable (a category without an image falls back to a
   * placeholder on the public website).
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;
}
