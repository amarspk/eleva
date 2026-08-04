import { IsString, IsNotEmpty, IsInt, Min, Length, IsUUID } from 'class-validator';

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
}
