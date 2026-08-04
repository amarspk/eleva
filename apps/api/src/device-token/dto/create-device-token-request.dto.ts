import { IsString, IsNotEmpty, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateDeviceTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ios', 'android', 'web', 'unknown'])
  deviceType!: string;

  @IsUUID('4')
  @IsOptional()
  userId?: string; // optional for admin registering others, otherwise from JWT
}
