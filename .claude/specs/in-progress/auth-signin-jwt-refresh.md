# Spec: auth-signin-jwt-refresh
**Status:** in-progress
**Owner:** @arul.goyal
**Started:** 2026-06-16

## Goal
Step 5: add `POST /auth/signin` (verify password → issue JWT access + refresh
tokens), `POST /auth/refresh` (rotate tokens), a custom `JwtAuthGuard`, and a
protected `GET /user/me`. Uses `@nestjs/jwt` (no Passport). Refresh token is
stored as a **hash** in a new `users.refresh_token_hash` column (single active
session). Spec doubles as the teaching artifact (the JWT explainer, payload
fields, short-expiry/refresh rationale, guard-vs-middleware, expired/invalid/missing).

---

## Decisions (locked with user)
- [x] **Guard/JWT:** `@nestjs/jwt` `JwtService` for sign/verify + a **custom**
      `JwtAuthGuard implements CanActivate` (no `@nestjs/passport`).
- [x] **Refresh storage:** hashed `refresh_token_hash` column on `users`
      (`select:false`, nullable). Store a **hash of the token, never the raw
      token**. Single active session (new signin overwrites it).
- [x] **/auth/refresh contract:** client sends `{ refreshToken }` in JSON body;
      on success issue a **new** access *and* refresh token (**rotation**),
      overwrite the stored hash. Returns `{ accessToken, refreshToken }`.
- [x] **Access token expiry:** 15m. **Refresh expiry:** 7d (my default).
- [x] **Refresh token type:** a JWT signed with a *separate* secret carrying
      `{ sub }`. (Why a JWT, not an opaque string: the JWT gives us the userId +
      expiry to look the user up; the DB hash gives us revocation/rotation. Best
      of both.) *My design call — flag if you'd prefer opaque random tokens.*

---

## Part 2 — JWT explainer (the "explain before code" deliverable)

### The three parts: `header.payload.signature`
A JWT is three Base64URL strings joined by dots:
- **Header** — JSON `{ "alg": "HS256", "typ": "JWT" }`: which algorithm signs it.
- **Payload** — JSON claims (our `sub`, `email`, `role`, `iat`, `exp`).
- **Signature** — `HMACSHA256(base64(header) + "." + base64(payload), secret)`.

### "Signed" vs "encrypted"
- **Signing** proves **integrity + authenticity**, not secrecy. The signature is
  a keyed hash of header+payload. Anyone can *read* the payload; only someone with
  the **secret** can produce a signature that matches it.
- **Encrypting** would make the content **unreadable** without a key. JWTs (the
  common `JWS` form) are **signed, not encrypted** — so never put secrets
  (passwords, card numbers) in the payload.

### Why the payload is readable by anyone but not forgeable
Base64URL is **encoding, not encryption** — trivially decodable (paste into
jwt.io). But if an attacker changes `role: student` → `role: admin`, the signature
no longer matches the tampered payload, and `jwt.verify()` (which recomputes the
HMAC with our secret and compares) **rejects it**. Forging a valid signature
requires the secret, which never leaves the server.

### The secret key & where it lives
- For HS256 it's a single symmetric secret used to both sign and verify.
- It lives in an **environment variable** (`JWT_SECRET`), never in code or git.
  We use a **separate** `JWT_REFRESH_SECRET` so a leak of one token type's secret
  doesn't compromise the other. (Prod: a secrets manager; long random value.)

### Stateless auth vs sessions — the trade-off
- **Stateless (JWT):** the token itself carries the identity; the server verifies
  the signature and trusts the claims — **no per-request DB/session lookup**.
  Scales horizontally trivially (any node can verify). **Cost:** you can't easily
  *revoke* a token before it expires — it's valid until `exp`. That's exactly
  why access tokens are **short-lived** (15m) and why we add a DB-backed refresh
  token we *can* revoke.
- **Sessions (stateful):** server stores a session id; each request looks it up.
  **Revocation is instant** (delete the session), but every request hits the
  session store and you need shared/sticky sessions across nodes.
- Our design is the common hybrid: stateless short access token + stateful
  (hashed-in-DB) refresh token.

---

## Part 3 — Access token generation
- `@nestjs/jwt` `JwtService.signAsync(payload, opts)`.
- **Payload `{ sub, email, role, iat, exp }`** — each field:
  - `sub` (**subject**) = the user id (`BaseEntity.id`, a **string** bigint). The
    standard claim for "who this token is about." Used by the guard to identify
    the caller without a DB hit.
  - `email` — convenience so downstream code/logs have it without a lookup.
  - `role` — drives authorization (a future `RolesGuard` reads it). Putting it in
    the token is why role checks can be **stateless**.
  - `iat` (**issued-at**) — auto-added by JwtService. Lets us reason about token
    age (e.g. reject tokens issued before a password change).
  - `exp` (**expiry**) — auto-added from `expiresIn`. After this, `verify()` throws
    `TokenExpiredError`. This is the whole enforcement of short-lived tokens.
- **Why 15-minute expiry matters:** a stateless token can't be revoked mid-life.
  If it leaks (XSS, logging, a proxy), the blast radius is bounded to ~15 minutes.
  Short access token + refresh token = "mostly stateless, but exposure is small
  and recoverable."

---

## Part 4 — Refresh token
- **Why have one if we already have a JWT?** Because the access token is
  deliberately short-lived — without a refresh token the user would re-enter their
  password every 15 minutes. The refresh token is a longer-lived (7d) credential
  whose *only* job is to mint new access tokens. It's higher-value, so it's
  **stored hashed and server-checked** (revocable), unlike the access token.
- **Storage:** new column `users.refresh_token_hash` (`varchar(255)`, nullable,
  `select:false`). On signin we generate the refresh JWT, store `sha256(token)`,
  and return the raw token once. **Why sha256, not bcrypt here?** bcrypt's slowness
  protects *low-entropy* secrets (human passwords). A refresh JWT is *high-entropy*
  and long — a fast `sha256` is sufficient and keeps `/refresh` quick. (Still
  hashed so a DB leak can't be replayed.)
- **`POST /auth/refresh` flow:** body `{ refreshToken }` →
  1. `jwt.verify(refreshToken, JWT_REFRESH_SECRET)` → get `sub` (401 if bad/expired).
  2. Load user + stored `refresh_token_hash`; compare `sha256(presented)` to it
     (401 if mismatch — covers a rotated/revoked token).
  3. **Rotate:** issue new access + refresh tokens, overwrite the stored hash.
  4. Return `{ accessToken, refreshToken }`.
- Rotation means a stolen refresh token is effectively single-use: once the real
  user (or the thief) refreshes, the other's copy no longer matches the stored hash.

---

## Part 5 — JwtAuthGuard
- **What a Guard is (vs Express middleware):** a Guard implements `CanActivate` and
  returns `true`/`false` (or throws) to decide whether a request proceeds to the
  handler. Like Express middleware it runs before the handler — but it's
  **Nest-aware**: it receives an `ExecutionContext` (knows the target controller/
  handler, works for HTTP/WS/gRPC), is **DI-injectable** (can use `JwtService`),
  and is **declarative** (`@UseGuards(JwtAuthGuard)` on a route/controller, or
  `@SetMetadata` for public routes). Express middleware is just `(req,res,next)`
  with no DI and no handler context.
- **Behaviour:** read `Authorization: Bearer <token>`; `jwt.verify` it with the
  access secret; on success attach the payload to `req.user` and return true.
- **Expired vs invalid vs missing — all → HTTP 401**, distinguished by message:
  - **Missing** (no/!Bearer header): `UnauthorizedException('Missing bearer token')`.
  - **Expired** (`TokenExpiredError`): `UnauthorizedException('Token expired')` —
    the signal to the client to call `/auth/refresh`.
  - **Invalid** (`JsonWebTokenError`: bad signature/malformed): `UnauthorizedException('Invalid token')`.
- A small `@CurrentUser()` param decorator extracts `req.user` for handlers.
- **`GET /user/me`:** `@UseGuards(JwtAuthGuard)`; loads the user by `sub` via
  `UserService.findById` and returns the safe user (hash columns are `select:false`
  so they never serialize).

### Module wiring (avoiding a circular dependency)
`AuthModule` already imports `UserModule` (for `UserService`). If `UserModule`
imported `AuthModule` to get the guard, that's a cycle. Fix: a small **`@Global()`
`JwtAuthModule`** that registers `JwtModule` (async, from `ConfigService`) and
provides+exports `JwtService` and `JwtAuthGuard`. Imported once in `AppModule`;
`JwtService` (signing) and `JwtAuthGuard` (protecting `/user/me`) are then
available everywhere with no cycle. Refresh tokens are signed by passing
per-call `{ secret, expiresIn }` overrides to the same `JwtService`.

---

## Part 6 — Tests
New/updated specs, following the existing `Test.createTestingModule` + mocked-
`UserService` style; `JwtService` is **real** (registered with a test secret) so
sign/verify/rotation are genuinely exercised.

- **`auth.service.spec.ts` (signin):**
  - happy path → returns `{ accessToken, refreshToken }`; `updateRefreshTokenHash` called; access token decodes to `{ sub, email, role }`.
  - wrong password → `UnauthorizedException`; no tokens; refresh hash not written.
  - unknown email → `UnauthorizedException` (same generic message — no enumeration); a **dummy bcrypt.compare** runs so timing doesn't reveal whether the email exists.
- **`auth.service.spec.ts` (refresh):**
  - valid + hash matches → new tokens; stored hash rotated (updateRefreshTokenHash called with the new hash).
  - presented token's hash ≠ stored (reused/revoked) → `UnauthorizedException`.
  - invalid/expired refresh JWT → `UnauthorizedException`.
- **`jwt-auth.guard.spec.ts`:** missing header / invalid token / expired token each → `UnauthorizedException` with the right message; valid token → `true` and `req.user` populated.
- **`signin.dto.spec.ts`:** email format + password presence.

---

## Files touched
- `cashroom-backend/package.json` (modified) — add `@nestjs/jwt`
- `cashroom-backend/.env` & `.env.example` (modified) — `JWT_SECRET`, `JWT_EXPIRES_IN=15m`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN=7d`
- `cashroom-backend/src/user/entities/user.entity.ts` (modified) — `refreshTokenHash` column (`select:false`, nullable)
- `cashroom-backend/src/database/migrations/<ts>-AddRefreshTokenHashToUsers.ts` (new, generated + reviewed)
- `cashroom-backend/src/user/user.service.ts` (modified) — `findByEmailWithPassword()`, `findById()`, `findByIdWithRefreshHash()`, `updateRefreshTokenHash(id, hash|null)`
- `cashroom-backend/src/auth/jwt-auth.module.ts` (new) — `@Global()` JwtModule + guard wiring
- `cashroom-backend/src/auth/guards/jwt-auth.guard.ts` (new) — custom `CanActivate`
- `cashroom-backend/src/auth/decorators/current-user.decorator.ts` (new)
- `cashroom-backend/src/auth/interfaces/jwt-payload.interface.ts` (new) — `JwtPayload`
- `cashroom-backend/src/auth/dto/signin.dto.ts` (new) — `email`, `password`
- `cashroom-backend/src/auth/dto/refresh.dto.ts` (new) — `refreshToken`
- `cashroom-backend/src/auth/auth.service.ts` (modified) — `signin()`, `refresh()`, token helpers
- `cashroom-backend/src/auth/auth.controller.ts` (modified) — `@Post('signin')` (200), `@Post('refresh')` (200)
- `cashroom-backend/src/auth/auth.module.ts` (modified) — (JwtService comes from global module; still imports UserModule)
- `cashroom-backend/src/user/user.controller.ts` (modified) — `@Get('me')` guarded
- `cashroom-backend/src/app.module.ts` (modified) — import `JwtAuthModule`
- `cashroom-backend/src/auth/auth.service.spec.ts` (modified) — signin + refresh tests
- `cashroom-backend/src/auth/guards/jwt-auth.guard.spec.ts` (new)
- `cashroom-backend/src/auth/dto/signin.dto.spec.ts` (new)

## Validation
- **Unit (`npm test`):** all new specs pass (signin happy/wrong-pw/unknown-email, refresh valid/reused/expired, guard missing/invalid/expired/valid).
- **Lint + typecheck:** `npm run lint` and `tsc --noEmit` clean.
- **Migration:** `migration:generate` → review SQL (adds nullable `refresh_token_hash`) → `migration:run`; `\d users` shows the column; `migration:revert` drops it cleanly, then re-run.
- **Manual (curl, real DB):**
  - signin valid → **200** `{ accessToken, refreshToken }`; decode access token at jwt.io → `{ sub, email, role, iat, exp }`, exp ≈ 15m out.
  - signin wrong password / unknown email → **401** generic message.
  - `GET /user/me` with `Authorization: Bearer <access>` → **200** safe user; no token → **401 missing**; tampered token → **401 invalid**; expired (use a 1s test expiry) → **401 expired**.
  - `POST /auth/refresh` with the refresh token → **200** new pair; reusing the *old* refresh token afterwards → **401** (rotation works); confirm `refresh_token_hash` changed in DB.

## Rollback
- Code: delete new files; revert modified ones.
- Deps: `npm uninstall @nestjs/jwt`.
- Schema: `npm run migration:revert` (drops `refresh_token_hash`). No data at risk.

## Risk: MEDIUM
New code, reversible, no prod data — but it's **core auth/security** (JWT secrets,
token signing/verification, refresh rotation, a protected-route guard), so the
secret handling, the "tokens/hashes never leak in responses or logs", the
no-enumeration signin, and the verify logic get extra review scrutiny.

---

## Open questions (non-blocking; resolve at implementation)
1. **Refresh token = JWT vs opaque random string** — defaulting to JWT (rationale
   above). Flag if you'd rather a `crypto.randomBytes` opaque token.
2. **`@Global()` JwtAuthModule vs explicit imports** — using @Global to avoid the
   Auth↔User cycle; the alternative is `forwardRef`, which is messier.
3. **`/user/me` returns DB-loaded user vs raw token claims** — defaulting to a
   fresh `findById` (reflects current role/verified state, costs one query).
