import { IsInt, Min, Max, IsOptional, IsString, IsUUID } from 'class-validator';
export class CreateRatingDto {
  @IsUUID('4') orderId!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() feedback?: string;
}
