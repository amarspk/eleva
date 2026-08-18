import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from 'class-validator';
export class CreateComplaintDto {
  @IsString() @IsNotEmpty() @MaxLength(255) subject!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsOptional() @IsUUID('4') orderId?: string;
}
