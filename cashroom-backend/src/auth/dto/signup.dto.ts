import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Match } from '../../common/validators/match.decorator';

/**
 * SignupDto
 * ─────────
 * Describes the *untrusted* shape of the POST /auth/signup request body — NOT the
 * User entity. Keeping them separate means the client can never set fields it
 * shouldn't (id, role, isEmailVerified): those simply aren't on this DTO, and the
 * global ValidationPipe's `whitelist`/`forbidNonWhitelisted` strip/reject extras.
 *
 * The decorators attach validation metadata (via reflect-metadata). The global
 * ValidationPipe transforms the JSON into a SignupDto instance and runs these
 * rules; any failure → HTTP 400 before AuthController/AuthService run.
 */
export class SignupDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  // Length is the dominant strength factor (no forced complexity, NIST-aligned).
  // Max 72 because bcrypt silently ignores bytes beyond 72.
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(72)
  password: string;

  @IsString()
  @Match('password', { message: 'passwords do not match' })
  confirmPassword: string;
}
