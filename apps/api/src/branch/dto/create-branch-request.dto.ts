import { IsString, IsNotEmpty, Length, IsOptional, IsNumber, IsObject, IsUUID } from 'class-validator';

export class CreateBranchRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  restaurantId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsObject()
  @IsNotEmpty()
  operatingHours!: Record<string, unknown>;
}
