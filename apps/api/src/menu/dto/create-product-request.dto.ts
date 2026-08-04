import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, IsInt, Length, IsUUID } from 'class-validator';

export class CreateProductRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 255)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  calories?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  preparationTime?: number;
}
