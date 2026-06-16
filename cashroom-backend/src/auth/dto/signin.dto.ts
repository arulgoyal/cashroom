import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * SigninDto
 * ─────────
 * Body of POST /auth/signin. Deliberately lighter than SignupDto: we validate
 * shape (a string email, a non-empty password within bcrypt's 72-byte window)
 * but NOT the password policy — that's signup's job. Re-enforcing MinLength(8)
 * here would leak the policy and reject legitimate older passwords if the policy
 * ever changes. We only need enough to attempt a lookup + compare.
 */
export class SigninDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'password must not be empty' })
  @MaxLength(72)
  password: string;
}
