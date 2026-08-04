import { IsString, IsEnum, IsOptional, MaxLength, IsUUID } from 'class-validator';

export enum MediaTypeDto {
  IMAGE = 'IMAGE',
  LOGO = 'LOGO',
  BANNER = 'BANNER',
  AVATAR = 'AVATAR',
  DOCUMENT = 'DOCUMENT',
}

export class UploadMediaDto {
  @IsString()
  @MaxLength(50)
  entityType!: string;

  @IsUUID('4')
  @MaxLength(255)
  entityId!: string;

  @IsEnum(MediaTypeDto)
  mediaType!: MediaTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
