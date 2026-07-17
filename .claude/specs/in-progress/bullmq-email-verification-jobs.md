# Spec: bullmq-email-verification-jobs

**Status:** in-progress
**Owner:** @arulgoyal
**Started:** 2026-07-18

## Goal
Add BullMQ background job processing to Cashroom. After signup, the API enqueues
a `send-verification-email` job (payload `{ userId, email, verificationToken }`)
onto a Redis-backed `email` queue. A **separate lean worker process** (Redis
only, no DB) consumes it and logs "Would send email to {email}" (simulated — no
real provider yet). The job retries with exponential backoff (3 attempts); a
processor that exhausts its retries is moved to an explicit **Dead Letter Queue**
(`email-dlq`) that can be inspected and replayed. Queue state is viewable via a
**Bull Board UI** and a **CLI**. This teaches queues, workers, at-least-once
delivery, retries/backoff, and DLQs.

## Decisions
- [x] **Token = stateless signed JWT**, no DB column/migration (user-selected).
      Signup signs a short-lived verify JWT (`sub=userId`) with a dedicated
      `EMAIL_VERIFICATION_SECRET`; it goes in the payload. The `/auth/verify`
      endpoint that consumes it is deferred to a later step.
- [x] **DLQ = explicit `email-dlq` queue + replay** (user-selected). On final
      failure the worker adds the job to `email-dlq`; a CLI can inspect + replay
      (re-enqueue to `email`).
- [x] **Inspection = Bull Board UI + CLI** (user-selected).
- [x] **Worker = separate process/container**, same image, `command:` override
      → `node dist/worker/main.worker.js`. Booted via
      `NestFactory.createApplicationContext(WorkerModule)` (no HTTP). Uses
      `@nestjs/bullmq` `@Processor('email')`. **No DB access** this step (the job
      only logs), keeping the worker lean.
- [x] **Retry policy:** `attempts: 3`, `backoff: { type: 'exponential', delay:
      1000 }` (~1s, 2s, 4s), `removeOnComplete: true`, `removeOnFail: false`.
- [x] **Failure simulation:** processor throws while `job.attemptsMade < 2`
      (fail, fail, succeed). A `forceFail` payload flag makes a job always throw
      — used to demonstrate the DLQ. (Exact attemptsMade indexing verified at
      build time.)
- [x] **Enqueue is non-fatal to signup:** wrapped in try/catch — a Redis outage
      logs an error but signup still returns 201. (Trade-off noted below.)
- [x] **Redis wiring:** shared connection factory from `REDIS_HOST/PORT/PASSWORD`.
      Host dev → `localhost`; compose → `redis` (service name).

## Why these shapes (the teaching points, for the learning note)
- **Sync email in signup = bad:** a slow/down provider would block the signup
  response (latency) or fail it (a transient email problem must NOT fail account
  creation). Enqueue = decouple; signup returns fast, the email is retried async.
- **Worker as separate process:** isolates blast radius (a stuck job can't starve
  API request threads), scales independently (N workers vs M API pods), and can
  be deployed/restarted on its own. Same code, different entrypoint.
- **Pass IDs not objects:** the payload is serialized to Redis and may run
  minutes later — a whole User object would be stale (role/email may change) and
  leak fields (hashes). IDs are small, and the worker re-reads fresh state if it
  needs to. (Here we pass email too, only because the worker has no DB.)
- **At-least-once:** a job may run MORE than once (worker crash after work,
  before ack). Handlers must be idempotent. Logging is; a real send would need a
  dedupe key.
- **Exponential backoff:** wait grows (1s→2s→4s) instead of hammering a struggling
  dependency at a fixed interval — gives it time to recover and avoids retry
  storms (thundering herd). Prod adds jitter.
- **DLQ:** where a job lands after exhausting retries, so it's not lost and
  doesn't block the queue. Someone/something monitors DLQ depth (alert on > 0 or
  a threshold) → on-call triages, fixes the cause, replays.

## Files touched
**cashroom-backend:**
- `package.json` (modified) — add `@nestjs/bullmq`, `bullmq`, `@bull-board/api`, `@bull-board/express`; scripts `worker:dev`, `queue:inspect`, `queue:replay`
- `src/queue/queue.constants.ts` (new) — queue names + job name
- `src/queue/email-job.interface.ts` (new) — payload type
- `src/queue/bull-connection.ts` (new) — ConfigService → BullMQ connection opts
- `src/queue/queue-cli.ts` (new) — inspect / replay (+ enqueue a demo forceFail job)
- `src/app.module.ts` (modified) — `BullModule.forRootAsync`, mount nothing here
- `src/auth/auth.module.ts` (modified) — `BullModule.registerQueue({name:'email'})`
- `src/auth/auth.service.ts` (modified) — inject `email` queue; sign verify JWT; enqueue (try/catch)
- `src/main.ts` (modified) — mount Bull Board at `/admin/queues`
- `src/worker/worker.module.ts` (new) — ConfigModule + BullModule connection + registerQueue `email-dlq` + EmailProcessor
- `src/worker/email.processor.ts` (new) — `@Processor('email')`: process + `@OnWorkerEvent('failed')` → DLQ on exhaustion
- `src/worker/main.worker.ts` (new) — standalone Nest context bootstrap
- `.env`, `.env.example` (modified) — `REDIS_HOST/PORT/PASSWORD`, `EMAIL_VERIFICATION_SECRET`, `EMAIL_VERIFICATION_EXPIRES_IN`
- specs: `src/worker/email.processor.spec.ts`, `src/auth/auth.service.spec.ts` (extend — enqueue assertion)

**Root:**
- `.env`, `.env.example` (modified) — `EMAIL_VERIFICATION_SECRET`, `EMAIL_VERIFICATION_EXPIRES_IN`
- `docker-compose.yml` (modified) — new `cashroom-worker` service (command override, depends_on redis healthy); wire `REDIS_*` + `EMAIL_VERIFICATION_*` into `cashroom-backend`
- `learning/08-bullmq-email-jobs-dlq.md` (new, local-only)

*(No Dockerfile change: the image already builds `dist/worker/main.worker.js`; compose overrides the command.)*

## Validation
- **Unit:** processor throws while `attemptsMade < 2`, succeeds after; `forceFail`
  always throws; the `failed` handler adds to DLQ only when attempts are
  exhausted (mock DLQ queue). AuthService.signup adds one job with the right name,
  payload `{userId,email,verificationToken}`, and options (attempts 3,
  exponential); a queue `.add` rejection does NOT fail signup.
- **Integration/manual (docker compose, incl. worker):**
  1. Signup via BFF → worker logs: attempt 1 fail → (backoff) → attempt 2 fail →
     attempt 3 "Would send email to …". Show the timing gap from backoff.
  2. Enqueue a `forceFail` job (CLI) → 3 attempts fail → **moved to `email-dlq`**.
  3. `npm run queue:inspect` → shows counts + the DLQ job. Bull Board at
     `http://localhost:3000/admin/queues` shows `email` + `email-dlq`.
  4. `npm run queue:replay` → DLQ job re-enqueued to `email`.
  5. Inspect Redis keys: `redis-cli -a … KEYS 'bull:*'`.
- **Gates:** `npm run lint`, `tsc --noEmit`, `npm test` green.

## Rollback
Additive. `git revert` the commit: removes the queue/worker code, deps, and the
`cashroom-worker` compose service; reverts signup. Because enqueue is wrapped in
try/catch, even a partial rollback leaves signup functional. No schema/data
changes (token is stateless). Redis data is ephemeral (queues can be flushed).

## Risk: MEDIUM
Touches the signup critical path (but the enqueue is non-fatal by design), adds a
new long-running worker process + container, new deps, and a hard Redis
dependency for the async path. All additive and behind the existing flow; signup
still succeeds if Redis is down.

## Known limitations (flagged, not solved — for the learning note)
1. **No transactional outbox.** User is committed to Postgres, THEN the job is
   enqueued to Redis — two systems, not atomic. If the process dies between them,
   the email is never queued (lost). The production-grade fix is the outbox
   pattern (write the job intent in the same DB tx, a relay publishes it). Out of
   scope here; enqueue-with-catch is the pragmatic stand-in.
2. **Bull Board is unauthenticated** and mounted on the backend (`:3000`). Fine
   for local dev; production must protect it (auth/network policy). Note: via the
   BFF (`:3001`) it would require a JWT (not in the public allowlist), so use the
   direct backend port in dev.
3. **CLI runs from the host** (lean prod image omits ts-node/src) — same pattern
   as migrations.
4. **Worker has no DB** this step, so it can't flip `isEmailVerified`; that (and
   `/auth/verify`) comes with the real verification flow later.
