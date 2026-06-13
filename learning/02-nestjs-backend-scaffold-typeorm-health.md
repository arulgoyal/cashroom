# Step 02 — Scaffolding the NestJS Backend (modules, TypeORM, /health)

**Goal:** Create `cashroom-backend` as a runnable NestJS app with feature module
skeletons, a Postgres connection via TypeORM, and a `/health` endpoint.

**Result:** `GET /health` → `{"status":"ok","db":"connected"}` (HTTP 200).

---

## 1. What NestJS is, vs Express / Sails
NestJS is an opinionated framework **on top of Express** (default; Fastify
optional). Closer to Sails than to raw Express.

| | Raw Express | Sails.js | NestJS |
|---|---|---|---|
| Structure | you invent it | convention (auto-wired) | convention via **explicit declarations** (Modules) |
| Wiring | manual require/use | implicit magic/globals | **Dependency Injection** — explicit but automated |
| Language | JS (TS bolt-on) | JS-first | **TypeScript-first** (decorators) |
| Under hood | — | Express | Express (swappable) |

Key idea: **Sails hides the wiring; NestJS makes it explicit but automates it.**
You declare what a module provides and what a class needs; the DI container
connects them. No spooky globals — you can always trace a dependency's origin.

### What `nest new` generates
- `src/main.ts` — entry point. `NestFactory.create(AppModule)` + `app.listen()`. Bootstraps from the **root module**, not a bare app object.
- `src/app.module.ts` — the root module.
- `app.controller.ts` / `app.service.ts` / `*.spec.ts` — hello-world demo (we deleted these).
- `test/` — Supertest e2e setup.
- `package.json` scripts: `start:dev` (watch, ~nodemon), `build`, `test`, `lint`.
- `tsconfig.json`, `nest-cli.json`, eslint/prettier.

---

## 2. Module → Controller → Service
Generated with: `nest g module X`, `nest g controller X --no-spec`,
`nest g service X --no-spec`. The CLI auto-edits `app.module.ts` (adds the module
to `imports`) and each module file (adds controller to `controllers`, service to
`providers`). Watching it edit those files *is* the lesson in how the declaration
graph is maintained.

| Layer | Job | Sails | MVC |
|---|---|---|---|
| **Controller** | HTTP only — parse request, return response. No business rules. | `api/controllers` | C |
| **Service** (provider) | Business logic + data access. HTTP-agnostic; callable from controllers, workers, crons. | `api/services` | domain |
| **Module** | Wiring/boundary. Groups a feature's controller+service; declares `imports` and `exports`. | *no equivalent* | — |

Discipline: **controllers thin, services hold logic.** A `@Module({...})` decorator
is just metadata telling Nest's DI container what this module owns. The thing
Sails lacks is the **Module boundary** — `export` a service to share it, or keep
it private. That encapsulation is what stops a big app becoming a ball of mud.

---

## 3. TypeORM
- **ORM** = maps objects (`user.firstName`) ↔ rows/columns (`first_name`). Gain: type-safety, less boilerplate, portability. Cost: less control, can emit bad queries (N+1). Productivity-for-control trade.
- **vs Sequelize / raw SQL:** TypeORM is **TypeScript-first**; default **Data Mapper** pattern (a `Repository` persists; the entity stays a plain object) — cleaner than Sequelize's Active Record. Integrates naturally with Nest via `@nestjs/typeorm`.
- **Entity** = a class mapped to a table. Each instance = a row; each decorated property = a column. One class is simultaneously the TS type, the schema definition, and (optionally) the source to generate the table — **one source of truth**.

### DatabaseModule (`src/database/database.module.ts`)
- Uses `TypeOrmModule.forRootAsync` (not `forRoot`) so config is built from
  injected `ConfigService` — config flows through DI, not `process.env` directly.
- `autoLoadEntities: true` — feature modules register entities via
  `TypeOrmModule.forFeature([...])`; no manual master list.
- **`synchronize: false`** — `true` would auto-create/alter tables from entities on
  every boot and **can drop columns / lose data**. Unacceptable for a lending
  ledger. We will use explicit migrations instead.
- `logging` on outside production — that's why boot showed `SELECT version()`.

Packages installed: `@nestjs/typeorm typeorm pg @nestjs/config`.

---

## 4. The /health endpoint
`src/health/health.controller.ts`: `@Controller('health')`, injects TypeORM's
`DataSource` via `@InjectDataSource()`, runs `SELECT 1` (cheapest round-trip that
proves the DB answers — touches no tables), returns `{ status:'ok', db }`.
`HealthModule` has a controller but **no service** (logic is trivial).

**Why health endpoints exist / what monitors them in production:**
- **Load balancers / ingress** poll it to decide whether to route traffic to an instance. Fail → pulled from rotation.
- **Kubernetes** uses *liveness* probes (restart if unhealthy) and *readiness* probes (don't send traffic until ready). Our `/health` is readiness-shaped.
- **Uptime monitors / alerting** (Pingdom, Datadog, Sentry crons) page humans when it fails.
- A health check should verify **real dependencies** (DB reachable), not just "process is alive" — a process can be up but unable to serve.
- Production-grade option: **`@nestjs/terminus`** gives composable indicators
  (DB, Redis, disk, memory) and a standard response. We hand-rolled it here to
  see the mechanism; terminus is the real-world choice once checks multiply.

---

## 5. Root module & the DI tree (`app.module.ts`)
`NestFactory.create(AppModule)` starts at `AppModule`. Nest reads its `imports`,
then their imports, recursively, building **one dependency-injection tree** for
the whole app. Nothing exists outside that tree. Order in our root:
`ConfigModule.forRoot({ isGlobal:true })` → `DatabaseModule` (infra) → feature
modules (`HealthModule`, `AuthModule`, `UserModule`, `LoanModule`).
`isGlobal:true` means `ConfigService` is injectable anywhere without re-importing.

---

## Run / verify (what we did)
```powershell
cd cashroom-backend
npm run start:dev            # watch mode
# elsewhere:
curl http://localhost:3000/health   # {"status":"ok","db":"connected"}
```

---

## Environment snag (RESOLVED — was transient)
- First `docker compose up -d` **failed to pull** `postgres:17-alpine` /
  `redis:7-alpine`: `lookup auth.docker.io: no such host`.
- Diagnosis: host DNS worked; daemon-side DNS worked on retry; the retried pull
  succeeded. **Root cause = transient.** The daemon routes through Docker
  Desktop's internal proxy (`http.docker.internal:3128`); on a corporate
  network/VPN that proxy occasionally drops, and during that window the daemon
  falls back to a direct connection with no DNS → the "no such host" error.
- **Fix:** just retry `docker compose up -d`. If it *persists*, restart Docker
  Desktop (re-establishes the proxy). The VM resolved Hub to IPv6-only addresses,
  so for *persistent* failures, forcing IPv4 DNS in daemon settings is the lever.
- Verified end-to-end on the **real pinned stack** (Postgres 17 + Redis 7, both
  healthy). The temporary `postgres:15` stand-in used during the outage was
  removed (`docker rm -f cashroom-pg-temp`).

## Things to question
1. **Two `.env` files must agree on the password** (root compose `POSTGRES_PASSWORD`
   ↔ backend `DATABASE_PASSWORD`). Coupling by convention; later, containerizing
   the backend lets it share one source.
2. **`nest new --skip-git` did not create a backend `.gitignore`** — we added one,
   so `.env` is protected. Always verify secrets are ignored before first commit.
3. **`synchronize:false`** means no tables auto-appear. When we add real entities
   we must write migrations — deliberate, for a money app.
4. **Hand-rolled health vs terminus** — fine now; revisit when checks multiply.
