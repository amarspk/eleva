import { IsString, IsNotEmpty, IsInt, Min, Max, IsUUID } from 'class-validator';

export class CreateTableRequestDto {
  @IsUUID('4')
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  seatingCapacity!: number;
}
