import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreatePresignedUrlRequestDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024) // 5MB max per DOC-007
  fileSize!: number;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsOptional()
  folder?: string; // e.g., branding, products, categories
}
