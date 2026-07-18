# Spec: observability-logging-requestid-health-sentry

**Status:** in-progress
**Owner:** @arulgoyal
**Started:** 2026-07-18

## Goal
Make Cashroom observable across all three processes (BFF, backend API, worker):
structured **Winston** logging (JSON in prod, pretty in dev) that carries a
**requestId** and **userId** on every line; a requestId generated at the BFF edge
and propagated to the backend (and into async jobs) for end-to-end correlation; an
enhanced **/health** that checks Postgres + Redis and reports uptime; and **Sentry**
error capture (DSN-optional — a no-op until a DSN is provided). Includes a live,
ephemeral intermittent-signup-bug debugging walkthrough that ends with clean code
plus a regression test.

## Decisions
- [x] **Sentry = DSN-optional / no-op** (user). `Sentry.init` runs only if
      `SENTRY_DSN` is set; unset = disabled, app unaffected. No DSN committed.
- [x] **Worker is in scope** (user): Winston + Sentry in the worker too; jobs carry
      the originating `requestId`/`userId` so worker logs correlate to the request.
- [x] **Debug scenario = ephemeral** (user): inject flaky bug → trace via logs +
      Sentry → remove → add a regression test. No bug lands in a commit.
- [x] **Request context = AsyncLocalStorage.** A middleware seeds
      `{ requestId, userId? }` into ALS at request entry; the Winston logger reads
      ALS on every call, so any `logger.log(...)` deep in a service automatically
      carries requestId/userId — no threading through call args.
- [x] **requestId lifecycle:** BFF generates a UUID at entry (ignores client-
      supplied X-Request-ID — the BFF is the trust edge); forwards it as
      `X-Request-ID` via the proxy `onProxyReq`; backend middleware reads that
      header (or generates one if called directly). Both apps echo it back on the
      response `X-Request-ID` header (support can quote it).
- [x] **userId timing:** middleware runs before guards, so it seeds requestId only;
      an APP_INTERCEPTOR (backend) / the auth guard (BFF) writes `userId` into the
      SAME ALS store after auth. (Mutating the store object propagates to later logs.)
- [x] **Winston integration = thin `LoggerService` + `app.useLogger`** (raw winston,
      not nest-winston — fewer deps, full control, matches the BFF's existing
      "replace one file" logger). Nest's own bootstrap/HTTP logs route through it.
- [x] **Health:** `GET /health` = READINESS — checks db (`SELECT 1`) + redis (ping
      via a small dedicated `ioredis` client) → `{ status, db, redis, uptime,
      timestamp }`; HTTP **200** when all ok, **503** when any dependency is down.
      Plus `GET /livez` = LIVENESS — `{ status:'ok', uptime }`, no dependency checks.
- [x] **Log levels:** error (needs attention), warn (recoverable/anomaly), info
      (normal lifecycle), debug (dev diagnostics; off in prod via `LOG_LEVEL`).

## Files touched
**cashroom-backend:**
- `package.json` — add `winston`, `@sentry/node`, `ioredis`
- `src/observability/logging.als.ts` (new) — ALS store + get/run/setUserId helpers
- `src/observability/logger.ts` (new) — winston factory (json/pretty by NODE_ENV/LOG_FORMAT), merges ALS context
- `src/observability/winston-logger.service.ts` (new) — Nest `LoggerService` wrapping winston
- `src/observability/request-context.middleware.ts` (new) — seed requestId into ALS, set response header
- `src/observability/user-context.interceptor.ts` (new) — write userId into ALS post-guard (APP_INTERCEPTOR)
- `src/observability/sentry.ts` (new) — init (no-op if no DSN) + captureException(withContext)
- `src/main.ts` (mod) — Sentry.init, `app.useLogger`, mount request-context
- `src/app.module.ts` (mod) — apply middleware, register APP_INTERCEPTOR
- `src/common/filters/all-exceptions.filter.ts` (mod) — Sentry capture (5xx) + requestId in log/response
- `src/health/health.controller.ts` (mod) — readiness object + `/livez`
- `src/health/redis-health.service.ts` (new) — ioredis ping (lazy, timeout)
- `src/health/health.module.ts` (mod) — provide RedisHealthService
- `src/queue/email-job.interface.ts` (mod) — optional `requestId`, `userId`
- `src/auth/auth.service.ts` (mod) — attach ALS requestId/userId to job payload
- `src/worker/{email.processor.ts,worker.module.ts,main.worker.ts}` (mod) — als.run per job, winston logger, Sentry
- `.env`, `.env.example` (mod) — `SENTRY_DSN`, `LOG_LEVEL`, `LOG_FORMAT`
- specs: logger/als, redis-health, request-context, filter-capture, + regression test

**cashroom-bff:**
- `package.json` — add `winston`, `@sentry/node`
- `src/common/logger.ts` (mod) — winston-backed, same `log()` signature, reads ALS
- `src/common/logging.als.ts` (new), `src/common/request-context.middleware.ts` (new)
- `src/common/sentry.ts` (new), `src/common/all-exceptions.filter.ts` (new — Sentry + requestId)
- `src/auth/bff-auth.guard.ts` (mod) — set userId in ALS after verify
- `src/proxy/backend-proxy.factory.ts` (mod) — forward `X-Request-ID`
- `src/main.ts` (mod) — Sentry.init, request-context before requestLogger, global filter
- `.env`, `.env.example` (mod)
- specs: als/logger, request-context, guard-sets-userId

**Root:** `.env`, `.env.example` (mod); `docker-compose.yml` (mod — `SENTRY_DSN`/`LOG_LEVEL`/`LOG_FORMAT` to all three services); `learning/09-observability-logging-requestid-sentry.md` (new, local).

## Validation
- **Unit:** logger emits requestId/userId from ALS; als.run isolates context between
  requests (no leakage); RedisHealthService reports connected/disconnected;
  request-context middleware generates+echoes requestId; AllExceptionsFilter calls
  Sentry.captureException only for 5xx and includes requestId; BFF guard writes
  userId. Regression test for the (removed) signup bug.
- **Integration/manual (docker compose):** one signup → grep logs across BFF +
  backend + worker for the SAME requestId (end-to-end correlation). `/health` shows
  db+redis+uptime (200); stop redis → `/health` 503, redis:disconnected. `/livez`
  stays 200. Trigger a 5xx → Sentry no-ops cleanly with DSN unset (log says skipped);
  the walkthrough shows what a set DSN would capture.
- **Gates:** lint, tsc, tests green in both apps.

## Rollback
Additive per app. `git revert` the commit removes the observability modules, deps,
and env wiring, and restores the prior `/health` + loggers. The requestId propagation
is header-based (ignored if absent), so partial rollback is safe. No schema/data changes.

## Risk: MEDIUM-HIGH
Touches the request pipeline and logging in BOTH apps + the worker, replaces the
logger via `app.useLogger`, and changes the `/health` contract (adds 503-on-degraded).
All additive and header/env-gated, but broad — the ALS wiring and middleware/guard
ordering are the parts to get right (and to test for context leakage).

## Known limitations (for the learning note)
1. **No distributed tracing (the "third pillar").** We add logs + correlation IDs,
   not spans/traces (OpenTelemetry). requestId is a poor-man's trace; real tracing
   shows timing across service boundaries. Out of scope; noted.
2. **No metrics pillar** either (no Prometheus/counters/histograms) — logs + errors
   only this step.
3. **BFF gains an exception filter**, so its error responses now match a consistent
   shape (+requestId) — we lose the Step-07 "shape tells you which tier rejected"
   trick, but requestId is a better debugging signal.
4. **requestId is generated fresh at the BFF** (client-supplied ignored). Behind a
   real API gateway you'd honor an upstream trace/correlation header instead.
5. **Health `/health` now returns 503 when a dependency is down** — correct for a
   readiness probe, but it means the compose healthcheck (and any caller) sees the
   backend as unhealthy if Redis is down, not just Postgres.
