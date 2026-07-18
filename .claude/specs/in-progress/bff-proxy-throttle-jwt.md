# Spec: bff-proxy-throttle-jwt

**Status:** in-progress
**Owner:** @arulgoyal
**Started:** 2026-07-17

## Goal
Create `cashroom-bff` — a NestJS Backend-for-Frontend that sits in front of
`cashroom-backend`. It reverse-proxies all requests to the backend while owning
three cross-cutting, edge concerns the backend should NOT: per-IP **rate
limiting** (`@nestjs/throttler`, 429 on exceed), **structured request logging**
(method/path/status/duration), and **JWT access-token verification** at the edge
(shared `JWT_SECRET`, HS256) with the verified identity forwarded to the backend
as `X-User-*` headers. Refresh tokens are proxied, not verified (revocation is
DB-authoritative in the backend). Both apps get Dockerfiles and join
docker-compose on a shared network so the full chain
`curl → BFF(:3001) → backend(:3000) → Postgres` runs with one `docker compose up`.

## Decisions
- [x] **Proxy = `http-proxy-middleware`** (streaming reverse proxy; pipes raw
      method/headers/body through, relays response verbatim). *(user-selected)*
- [x] **Topology = containerize backend too; full compose.** Add Dockerfiles for
      both apps; compose runs postgres, redis, cashroom-backend (:3000),
      cashroom-bff (:3001) on the default compose network. *(user-selected)*
- [x] **Routing = catch-all proxy + public allowlist + CORS on.** All paths
      forwarded; public allowlist (`/auth/signup`, `/auth/signin`,
      `/auth/refresh`, `/health`) skips JWT; everything else must pass BFF JWT
      verification first. CORS enabled for the frontend origin. *(user-selected)*
- [x] **Request lifecycle ordering (the crux).** In NestJS, middleware runs
      BEFORE guards — so the proxy CANNOT be plain middleware (throttler/JWT
      guards would never fire). Order enforced:
      1. `LoggingMiddleware` (runs first; hooks `res.on('finish')` for status+duration)
      2. `ThrottlerGuard` (global `APP_GUARD`) — per-IP limit → 429
      3. `BffAuthGuard` — allowlist check; protected paths verify access JWT, attach `req.user`
      4. Catch-all proxy handler — injects `X-User-Id/Email/Role` via `onProxyReq`, streams response
- [x] **`bodyParser: false`** in `NestFactory.create` so the raw request stream
      proxies untouched (BFF never needs the body; guards read only headers/IP).
- [x] **Refresh proxied, not verified** at BFF (separate secret + DB revocation).
- [x] **Backend DB host in-container = `cashroom-postgres`.** The backend compose
      service overrides `DATABASE_HOST=cashroom-postgres` (its `.env` says
      `localhost` for host-run dev). Services resolve each other by service name.
- [x] **Logger = minimal structured JSON now**, Winston deferred (stack calls for
      Winston later; a tiny JSON logger keeps this step focused).
- [x] **Throttle defaults:** TTL 60s, limit 100 req/min/IP, both env-configurable
      (`THROTTLE_TTL`, `THROTTLE_LIMIT`).
- [x] **CORS origin:** `FRONTEND_ORIGIN` env, default `http://localhost:5173` (Vite).
- [x] **Migrations in-container:** run manually via
      `docker compose exec cashroom-backend npm run migration:run` (schema already
      persisted in the volume). Auto-migrate-on-boot deferred.

## Files touched
**New project `cashroom-bff/` (scaffolded via Nest CLI):**
- `src/main.ts` (new) — bodyParser:false, CORS, listen on PORT (3001)
- `src/app.module.ts` (new) — ConfigModule global, ThrottlerModule, JwtModule, ProxyModule, `APP_GUARD: ThrottlerGuard`, LoggingMiddleware wiring
- `src/proxy/proxy.module.ts`, `src/proxy/proxy.controller.ts` (new) — catch-all `@All` handler invoking the proxy
- `src/proxy/proxy.factory.ts` (new) — builds the `http-proxy-middleware` instance (target=BACKEND_URL, onProxyReq → X-User-* headers)
- `src/auth/bff-auth.guard.ts` (new) — public allowlist + access-JWT verify
- `src/auth/public-routes.ts` (new) — the allowlist constant
- `src/common/logging.middleware.ts` (new) — structured method/path/status/duration
- `src/config/env.ts` (new, optional) — typed env access
- `.env`, `.env.example` (new) — PORT, BACKEND_URL, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_ORIGIN, THROTTLE_TTL, THROTTLE_LIMIT
- `Dockerfile`, `.dockerignore`, `.gitignore` (new)
- unit specs: `bff-auth.guard.spec.ts`, `logging.middleware.spec.ts` (new)

**`cashroom-backend/`:**
- `Dockerfile`, `.dockerignore` (new) — no source changes

**Root:**
- `docker-compose.yml` (modified) — add `cashroom-backend` + `cashroom-bff` services (build context, ports, env, depends_on healthchecks)
- `learning/07-bff-proxy-throttle-jwt.md` (new, local-only)

## Validation
- **Unit (BFF):** BffAuthGuard — public path skips verify; protected path with
  valid token attaches user; missing/invalid/expired token → 401 (never
  forwarded). LoggingMiddleware — emits one structured record with a numeric
  duration on `finish`.
- **Integration / manual (full chain, `docker compose up`):**
  1. `GET :3001/health` → 200 (public passthrough).
  2. `POST :3001/auth/signup` then `/auth/signin` → 201 / 200 with token pair (public).
  3. `GET :3001/user/me` **no token** → 401 **at the BFF** (backend never hit — prove via backend logs).
  4. `GET :3001/user/me` **with token** → 200; show `X-User-Id/Email/Role` arrived at the backend.
  5. Exceed limit rapidly → 429 from the BFF.
  6. Show the request/response at each hop (BFF structured log line + backend log).
- **Gates:** `npm run lint`, `tsc --noEmit`, `npm test` green in the BFF.

## Rollback
Fully additive. Revert the commit (`git revert`): removes `cashroom-bff/`, both
Dockerfiles, and the two new compose services. The host-run backend + existing
compose (postgres/redis) are unchanged and keep working. No schema/data changes.

## Risk: MEDIUM-HIGH
New network topology + first containerization of app code (backend `DATABASE_HOST`
changes inside compose), plus two NestJS subtleties to get right (middleware-vs-
guard ordering; the Express-5 wildcard route form for the catch-all). All additive
and behind a new port, so nothing existing breaks — but many moving parts, so
higher than a routine feature.

## Known implementation risks (resolve during build, not blocking approval)
1. **Express 5 wildcard route.** NestJS 11 may use Express 5, where `@All('*')`
   path syntax changed (`*splat` / `{*path}`). Pick the form the installed
   version accepts; verify the catch-all matches every path.
2. **Stream vs guard ordering** already decided above; confirm the raw body
   still streams after guards run (guards read only headers/IP, so it should).
3. **`onProxyReq` header injection** must set `X-User-*` from `req.user` set by
   the guard; ensure the guard runs and populates it before the handler proxies.
