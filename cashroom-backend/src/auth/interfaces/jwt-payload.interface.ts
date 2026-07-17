import { UserRole } from '../../user/enums/user-role.enum';

/**
 * The claims we put in an ACCESS token.
 *  - sub:   the user id (standard "subject" claim) — who the token is about.
 *  - email: convenience for downstream code/logs without a DB lookup.
 *  - role:  drives stateless authorization (a future RolesGuard reads this).
 * `iat` (issued-at) and `exp` (expiry) are added automatically by JwtService.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

/** What JwtService returns after verifying: our claims + the standard timestamps. */
export interface JwtPayloadWithTimestamps extends JwtPayload {
  iat: number;
  exp: number;
}

/**
 * A REFRESH token carries the subject plus a unique `jti` (token id). The jti
 * guarantees every issued refresh token is a distinct string — without it, two
 * refreshes in the same second would mint identical tokens and rotation would be
 * a no-op. `jti` may be absent when only reading legacy/verified payloads.
 */
export interface RefreshTokenPayload {
  sub: string;
  jti?: string;
}
