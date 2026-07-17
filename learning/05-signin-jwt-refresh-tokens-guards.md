# Step 05 — Signin, JWT, Refresh Tokens & Guards

**Goal:** Log a user in (`POST /auth/signin`), hand back a **JWT access token** +
a **refresh token**, protect a route (`GET /user/me`) with a custom
`JwtAuthGuard`, and let clients trade a refresh token for a fresh pair
(`POST /auth/refresh`) with **rotation**.

**Result:** signin returns `{ accessToken, refreshToken }`; the access token
expires in 15 min and decodes to `{ sub, email, role, iat, exp }`; `/user/me`
returns the caller only with a valid Bearer token; refresh rotates the token and
invalidates the old one. 21 unit tests + full curl verification against the real DB.

---

## 0. The shape of the whole thing
```
signup  → create user (Step 4)
signin  → verify password → issue ACCESS (15m) + REFRESH (7d) tokens
request → send "Authorization: Bearer <access>"  → JwtAuthGuard verifies it
expires → access dies after 15m → POST /auth/refresh with the refresh token
refresh → verify refresh token + DB hash → issue a NEW pair (rotation)
```
The mental model: **the access token is a short-lived ID badge you show on every
request; the refresh token is a longer-lived "renew my badge" coupon you keep safe
and use rarely.**

---

## 1. JWTs, properly understood

### Three parts: `header.payload.signature`
A JWT is three Base64URL chunks joined by dots:
- **Header** — `{ "alg": "HS256", "typ": "JWT" }` — which algorithm signs it.
- **Payload** — the claims (`sub`, `email`, `role`, `iat`, `exp`).
- **Signature** — `HMACSHA256( base64(header) + "." + base64(payload), secret )`.

Paste any JWT into jwt.io and you'll see all three. Try it with one of ours.

### "Signed" ≠ "encrypted" (the single most important point)
- **Signing** proves **integrity + authenticity**: "this content wasn't changed,
  and it came from someone who holds the secret." It does **not** hide anything.
- **Encrypting** would make the content **unreadable** without a key.
- A normal JWT is **signed, not encrypted**. So the payload is *public*. **Never
  put a secret (password, card number, OTP) in a JWT payload.**

### Why anyone can read it but nobody can forge it
Base64URL is **encoding, not encryption** — trivially reversible. So an attacker
*can* read `role: student`. But if they change it to `role: admin`, the signature
no longer matches the payload. On every request the server **recomputes** the HMAC
over the received header+payload using its secret and compares it to the signature
in the token. Tampered → mismatch → rejected. Forging a valid signature requires
the secret, which never leaves the server.

### The secret key & where it lives
- HS256 uses one symmetric secret to both sign and verify.
- It lives in an **environment variable** (`JWT_SECRET`), never in code/git.
- We use a **separate** `JWT_REFRESH_SECRET` for refresh tokens, so compromising
  one token type's secret doesn't compromise the other.
- Prod: a long random value (`openssl rand -hex 32`) from a secrets manager.

### Stateless auth vs sessions — the real trade-off
| | Stateless (JWT) | Stateful (sessions) |
|---|---|---|
| Where identity lives | inside the token | in a server-side store keyed by a cookie |
| Per-request cost | verify a signature (no DB) | look up the session (DB/Redis) |
| Scaling | any node verifies; trivial | need shared/sticky session store |
| **Revocation** | **hard — valid until `exp`** | **instant — delete the session** |

The JWT win is "no per-request lookup." The JWT *cost* is "you can't easily kill a
token mid-life." Our entire refresh-token design exists to manage that cost:
**short access token (small blast radius) + a refresh token we *can* revoke.**

---

## 2. Access token generation (`@nestjs/jwt`)
`JwtService.signAsync(payload, opts)`. Our payload `{ sub, email, role, iat, exp }`:

| Claim | Why it's there |
|---|---|
| `sub` (subject) | the user id — *who the token is about*. The guard reads this to know the caller **without a DB hit**. (Ours is a `string` because `id` is a bigint.) |
| `email` | convenience for logs/handlers without a lookup |
| `role` | this is what makes authorization **stateless** — a future `RolesGuard` reads the role straight from the token |
| `iat` (issued-at) | auto-added. Lets you reason about token age (e.g. "reject tokens issued before the last password change") |
| `exp` (expiry) | auto-added from `expiresIn`. After this instant, `verify()` throws `TokenExpiredError`. **This is the entire enforcement of "short-lived."** |

### Why 15-minute expiry matters
A stateless access token **can't be revoked** before `exp`. If it leaks (XSS, a
logged header, a sketchy proxy), the damage window = its remaining lifetime. 15
minutes keeps that window tiny. We *verified* this: `exp - iat == 900` seconds.

---

## 3. Refresh tokens — why, and how we store them

### Why have one at all if we already have a JWT?
Because the access token is deliberately short-lived. Without a refresh token the
user would re-type their password every 15 minutes. The refresh token is a
longer-lived (7d) credential whose **only** job is to mint new access tokens.

### The storage rule: hash it, never store the raw token
- New column `users.refresh_token_hash` (`varchar(255)`, nullable, `select:false`).
- On signin we generate the refresh token, store **`sha256(token)`**, and return
  the raw token to the client **once**.
- **Why sha256 here but bcrypt for passwords?** bcrypt is deliberately *slow* to
  protect **low-entropy** secrets (human passwords) from brute force. A refresh
  token is a **high-entropy** random JWT — there's nothing to brute-force, so a
  fast `sha256` is enough. Still hashed, so a DB leak can't be replayed.
- The hash, not the token, is the **source of truth for revocation**.

### Rotation — and the bug I would have shipped without it
`POST /auth/refresh` with `{ refreshToken }`:
1. `verify(refreshToken, JWT_REFRESH_SECRET)` → get `sub` (401 if bad/expired).
2. Load the user + stored hash; compare `sha256(presented)` to it (401 if no match).
3. **Rotate:** issue a new access + refresh pair, **overwrite** the stored hash.
4. Return the new pair.

> **The subtle bug:** my first refresh payload was just `{ sub }`. Signing
> `{ sub }` twice in the *same second* produces an **identical** token (same
> `iat`/`exp`) → rotation would store the same hash → a silent no-op. Fix: add a
> random **`jti`** (token id) so every issued refresh token is a distinct string.
> Verified in the DB: the stored hash changed `ad8ad94b… → 4521f055…` on refresh,
> and **reusing the old refresh token returned 401.**

Rotation means a stolen refresh token is effectively **single-use**: the moment
the real user (or the thief) refreshes, the other copy's hash no longer matches.

---

## 4. The JwtAuthGuard

### What a Guard is — vs Express middleware
A Guard implements `CanActivate` and returns `true`/`false` (or throws) to decide
whether a request reaches the handler.

| | Express middleware | NestJS Guard |
|---|---|---|
| Signature | `(req, res, next)` | `canActivate(ctx: ExecutionContext)` |
| Dependency injection | none | **yes** — ours injects `JwtService` |
| Knows the target handler? | no | **yes** (via `ExecutionContext`) |
| Applied by | `app.use(...)` order | declaratively: `@UseGuards(JwtAuthGuard)` |
| Transport | HTTP only | HTTP / WS / gRPC |

So a Guard is "middleware that's DI-aware, handler-aware, and declarative."

### Expired vs invalid vs missing — all 401, different messages
| Case | What happened | Message |
|---|---|---|
| **Missing** | no `Authorization: Bearer` header | `Missing bearer token` |
| **Expired** | well-formed, correctly signed, past `exp` (`TokenExpiredError`) | `Token expired` → client's cue to call `/auth/refresh` |
| **Invalid** | bad signature / malformed / wrong alg (`JsonWebTokenError`) | `Invalid token` |

The status is the same (401 — "you're not authenticated"); the **message** lets a
client distinguish "just refresh" from "something's wrong, re-login." All verified
with curl: missing → 401, tampered → 401 invalid, valid → 200.

### `GET /user/me`
`@UseGuards(JwtAuthGuard)`. The guard attaches the verified payload to `req.user`;
a small `@CurrentUser()` param decorator hands it to the method. We resolve `sub`
to the live DB row (so role/verified state is current) and return it.
`password_hash` and `refresh_token_hash` are `select:false`, so they're never
loaded or serialized — confirmed: the `/user/me` response contained neither.

---

## 5. Two codebase frictions worth remembering

### a) `findByEmail` could **not** be used for signin
`password_hash` is `select:false` (Step 4 — so it never leaks by default). That's
correct, but it means the default `findByEmail` query **omits the hash** — useless
for verifying a password. Fix: a dedicated `findByEmailWithPassword()` that
explicitly `.addSelect('user.passwordHash')`. The safe default stays safe; the one
method that legitimately needs the hash opts in.

### b) The Auth ↔ User import cycle, and the `@Global()` escape hatch
`AuthModule` imports `UserModule` (for `UserService`). But `/user/me` lives in
`UserModule` and needs the `JwtAuthGuard`. If `UserModule` imported `AuthModule`
back to get the guard → **circular dependency**. Fix: a small **`@Global()`
`JwtAuthModule`** that registers `JwtModule` and provides+exports the guard,
imported once in `AppModule`. Now `JwtService` (signing) and `JwtAuthGuard`
(protecting) are available everywhere with no cycle. (The alternative,
`forwardRef`, is messier.)

### c) (Carried from Step 3, bit us again) the generated migration tried to drop our CHECK
`migration:generate` for the new column *also* emitted
`DROP CONSTRAINT "chk_users_role"` — TypeORM doesn't see the hand-added CHECK in
entity metadata, so it thinks it's stray. **Always read the generated migration.**
I deleted those lines so it only adds the column, and verified the role CHECK
survived.

---

## 6. Security touches that aren't obvious
- **No user enumeration on signin:** unknown email and wrong password return the
  **same** generic 401 (`Invalid email or password`). And on the unknown-email
  path we run a **dummy bcrypt.compare** against a fixed hash, so response *timing*
  doesn't reveal whether an email exists either. (Note the tension with signup,
  which *does* reveal existence via 409 — see Things to question.)
- **Hashes never leave the service:** `passwordHash` and `refreshTokenHash` are
  stripped (`SafeUser` type) and `select:false` at the DB layer — belt and braces.
- **Signin is 200, not 201:** no resource is created; we're returning tokens.

---

## Run / verify (what we did)
```powershell
# unit tests (21, incl. signin/refresh/guard)
npm test

# manual, against the running app + real Postgres
POST /auth/signin   { email, password }          -> 200 { accessToken, refreshToken }
# decode access token payload -> { sub, email, role, iat, exp }, exp-iat == 900s
GET  /user/me  (Authorization: Bearer <access>)  -> 200 (no hash fields)
GET  /user/me  (no header)                        -> 401 "Missing bearer token"
GET  /user/me  (tampered token)                   -> 401 "Invalid token"
POST /auth/refresh  { refreshToken }              -> 200 new pair; old token now 401
```

---

## Things to question
1. **Single active session.** One `refresh_token_hash` column = one live session.
   Signing in on your phone silently logs out your laptop. Fine for a simple app;
   a real one wants a `refresh_tokens` table (per-device rows) for multi-device +
   per-session revocation.
2. **No logout / global revoke.** We can rotate, but there's no endpoint to *null*
   the hash (logout) or to revoke a stolen **access** token before its 15 min are
   up. Access tokens remain the unrevocable window; that's the JWT trade-off.
3. **Refresh token reuse isn't *detected*, just rejected.** A proper scheme treats
   "an already-rotated refresh token was presented" as a **breach signal** and
   nukes the whole session family. We just 401 it.
4. **`role` is baked into the access token.** Promote a user to admin and their
   *existing* access token still says `student` for up to 15 min (and vice-versa).
   That staleness is the price of stateless auth — usually acceptable, occasionally not.
5. **Enumeration asymmetry.** Signin is enumeration-resistant, but **signup** still
   returns 409 for a taken email — so an attacker can probe existence there. Closing
   that needs the "always say check-your-inbox" + email-verification pattern.
6. **Secrets are dev placeholders.** `.env` ships `dev_..._change_me` values.
   These MUST be long random per-environment secrets in staging/prod, and rotating
   `JWT_SECRET` instantly invalidates every live access token (sometimes a feature).
7. **bcrypt's 72-byte limit** still applies to signin: passwords are truncated at
   72 bytes by bcrypt. We cap at signup; just be aware the limit is real.
