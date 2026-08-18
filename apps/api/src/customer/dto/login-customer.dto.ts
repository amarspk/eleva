import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Public customer sign-in (Phase 4 — Customer Account).
 */
export class LoginCustomerDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
