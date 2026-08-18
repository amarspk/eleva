import { IsString, IsNotEmpty } from 'class-validator';
export class UpdateStatusDto { @IsString() @IsNotEmpty() status!: string; }
