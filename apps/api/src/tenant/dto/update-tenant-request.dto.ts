import { IsString, IsOptional, IsUrl, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BrandingDto {
  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @IsUrl()
  @IsOptional()
  bannerUrl?: string;

  @IsString()
  @IsOptional()
  primaryColor?: string;

  @IsString()
  @IsOptional()
  secondaryColor?: string;
}

export class UpdateTenantRequestDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  customDomain?: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;
}
