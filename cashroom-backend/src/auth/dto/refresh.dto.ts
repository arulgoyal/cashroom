import { IsJWT, IsString } from 'class-validator';

/**
 * RefreshDto
 * ──────────
 * Body of POST /auth/refresh. @IsJWT rejects anything that isn't even shaped like
 * a JWT (cheap 400 before we bother verifying the signature).
 */
export class RefreshDto {
  @IsString()
  @IsJWT({ message: 'refreshToken must be a valid JWT' })
  refreshToken: string;
}
