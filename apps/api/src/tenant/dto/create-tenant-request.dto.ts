import { IsString, IsEmail, IsNotEmpty, Length, Matches, IsOptional, IsNumber, Min, Max, IsObject, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class BranchDetailsDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(5, 200)
  address!: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, { open: string; close: string; closed: boolean }>;
}

export class CreateTenantRequestDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 63)
  @Matches(/^[a-z0-9-]+$/, { message: 'Subdomain must contain only lowercase alphanumeric characters and hyphens.' })
  subdomain!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  ownerFirstName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  ownerLastName!: string;

  @IsEmail()
  @IsNotEmpty()
  ownerEmail!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 64)
  ownerPassword!: string;

  @IsUUID('4')
  @IsNotEmpty()
  planId!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  restaurantName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercentage?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => BranchDetailsDto)
  branch?: BranchDetailsDto;
}
