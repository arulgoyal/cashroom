/**
 * Paths the BFF forwards WITHOUT requiring a JWT.
 * ───────────────────────────────────────────────
 * - /health          — liveness probe, must be reachable unauthenticated.
 * - /auth/signup     — you can't have a token before you have an account.
 * - /auth/signin     — this is how you GET a token.
 * - /auth/refresh    — refresh tokens use a DIFFERENT secret and are revocable
 *                      in the backend DB; the BFF can't verify them meaningfully,
 *                      so it proxies straight through and lets the backend decide.
 *
 * Everything else must pass BffAuthGuard's access-token check first.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/health',
  '/auth/signup',
  '/auth/signin',
  '/auth/refresh',
];

export function isPublicPath(path: string): boolean {
  // Tolerate a trailing slash so /auth/signin/ matches too.
  const normalized =
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return PUBLIC_PATHS.includes(normalized);
}
