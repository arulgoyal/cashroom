# Step 01 — Docker Compose: Local Dev Infrastructure (Postgres + Redis)

**Goal:** Stand up the backing services every Cashroom app will talk to, using
Docker Compose, before writing any application code.

**Files involved:** `docker-compose.yml`, `.env.example`, `.gitignore` (repo root).

---

## The two services

### PostgreSQL — the system of record
Anything that is *money or must survive forever* lives here: users, loan
applications, disbursements, repayment schedules, and especially **ledger
entries**. Needs durability, transactions, foreign keys, relational queries.
(Same role it plays in a Sails app — just containerised.)

| Field | Value | Meaning |
|---|---|---|
| `image` | `postgres:17-alpine` | Blueprint for the container. `17` pins the **major version**; `alpine` = tiny Linux base (smaller image, smaller attack surface). |
| `container_name` | `cashroom-postgres` | Stable human name instead of a random hash. Enables `docker logs cashroom-postgres`. |
| `restart` | `unless-stopped` | Restart on crash/reboot, but **not** if you deliberately stopped it. (Contrast `always`.) |
| `ports` | `"${POSTGRES_PORT:-5432}:5432"` | `HOST:CONTAINER`. Left = port on your machine; right = port inside the container. `:-5432` = default if env var unset. This is what lets psql/DBeaver connect. |
| `environment` | `POSTGRES_USER/PASSWORD/DB` | Read **only on first boot of an empty data dir** to create the superuser + database. See gotcha #2 below. |
| `volumes` | `postgres_data:/var/lib/postgresql/data` | Persists DB files outside the container. The single most important line for a database. |
| `healthcheck` | `pg_isready ...` | Exits 0 only when Postgres can *accept connections*. App containers later use this to wait for true readiness. |

### Redis — fast, mostly-disposable in-memory store
Two jobs in Cashroom:
1. **BullMQ backing store** — job queues, retries, delayed jobs, dead-letter queue.
   (BullMQ = successor to Bull; same Redis-backed model.)
2. **Caching / short-lived data** — sessions, rate-limit counters.

| Field | Value | Meaning |
|---|---|---|
| `image` | `redis:7-alpine` | Redis major 7 on Alpine. |
| `command` | `redis-server --appendonly yes --requirepass ...` | Overrides default startup. `--appendonly yes` = AOF persistence (log every write to disk, replay on restart). `--requirepass` = force auth even on localhost. |
| `volumes` | `redis_data:/data` | Where AOF/RDB files live so queue state survives restart. |
| `healthcheck` | authenticated `PING` → `PONG` | Confirms Redis is up *and* the password works. |

**Core mental model:** *Postgres is the truth that must never be lost; Redis is
fast, useful, and mostly disposable.* That asymmetry drives later design choices.

---

## Why Docker instead of installing locally
- **Reproducibility** — version-pinned recipe; everyone gets byte-identical infra. (Like a lockfile, but for infrastructure.)
- **Isolation** — run Cashroom's Postgres alongside your day-job Postgres without port/version conflicts.
- **Disposability** — `docker compose down -v` resets to clean in seconds.
- **Prod parity** — production runs containers/managed services, not hand-installed binaries; shrinks the dev↔prod gap.

---

## What a "volume" is, and why it matters for a DB
A container's own filesystem is **ephemeral** — destroyed when the container is
removed. If Postgres wrote into the container's own filesystem, `docker compose
down` would erase every loan record.

A **volume** is host-managed storage with its own lifecycle, mounted into the
container at a path:

```
Container (disposable)              Host (durable)
┌─────────────────────────┐
│ /var/lib/postgresql/data├──────►  volume: cashroom_postgres_data
└─────────────────────────┘         (survives container destroy/recreate)
```

Destroy/recreate the container any number of times — data persists, because it
never lived *in* the container.

- **Named volume** (used here): Docker owns it. Ideal for DB data.
- **Bind mount** (later): maps a specific host folder; used for live-reloading source into app containers.

---

## `.env` vs `.env.example`
- **`.env`** — flat `KEY=value` config + secrets (DB passwords, ports). Keeps secrets out of source code. **Gitignored — never committed** (git history is forever; a pushed secret is a leaked secret).
- **`.env.example`** — committed *documentation* of which vars exist, with safe placeholders (`change_me_local_only`). New devs copy it to `.env` and fill in real values.
- **How Compose reads it** — Compose **automatically** loads a file literally named `.env` next to `docker-compose.yml` and substitutes `${VAR}` at parse time. This is convention, not configuration.
  - Nuance: this `.env`→compose-file substitution is **separate** from the `environment:` block that injects vars *inside* a container. Two different mechanisms.

---

## Start / stop / verify (PowerShell)

```powershell
# one-time: create real .env from the template
Copy-Item .env.example .env
# then edit .env, replace both change_me_local_only passwords

docker compose up -d            # start in background
docker compose ps               # watch STATUS go -> healthy

# verify Postgres accepts connections
docker exec cashroom-postgres pg_isready -U cashroom -d cashroom_dev
# expect: ... accepting connections

# verify Redis answers (authenticated)
docker exec cashroom-redis redis-cli -a <your-redis-password> ping
# expect: PONG

docker compose logs -f postgres # tail logs if needed

docker compose down             # stop, KEEP data volumes
docker compose down -v          # stop AND DELETE volumes (wipes the DB)
```

`down` = "turn it off." `down -v` = "turn it off *and forget everything*." Don't
run `-v` on a real DB by accident.

---

## Things to question
1. **`environment: REDIS_PASSWORD` on the redis service is likely redundant.**
   In the healthcheck, `$REDIS_PASSWORD` has a **single** `$` → Compose
   interpolates it from `.env` at parse time, baking the literal password into
   the command *before* the container sees it. For the container's shell to
   expand it instead, it would need `$$REDIS_PASSWORD`. Works today, but for a
   different reason than the code implies. (Single-`$` vs double-`$$` is the rule
   to remember.)
2. **`POSTGRES_USER/PASSWORD/DB` only apply on a *fresh* volume.** Change the
   password in `.env` after first boot and it **won't** change — the data dir
   already exists, so the image skips init. Fix: `down -v` (destroys data) or
   `ALTER USER` inside the DB.
3. **"Latest stable" vs pinned `17`/`7`.** Comments say "latest stable" but values
   pin older-but-proven majors (newer Postgres 18 / Redis 8 exist). Pinning is a
   legitimate choice — just make the comment and the value agree. (Also: Redis's
   recent licensing change is why some teams now pick the Valkey fork.)

---

## Production vs Docker Compose (conceptual)
Compose is **single-host** — great for a laptop. Production splits the pieces:
- **Orchestration → Kubernetes / ECS** — a *cluster* of machines; schedules
  containers, self-heals, scales replicas, rolling zero-downtime deploys.
- **Database → managed service (RDS/Aurora, Cloud SQL)** — automated backups,
  point-in-time recovery, failover replicas, patching. You don't run prod
  Postgres in a container yourself.
- **Redis → managed cache (ElastiCache/MemoryStore)** — clustering + failover handled.
- **Secrets → secrets manager (Vault, AWS Secrets Manager, K8s Secrets)** —
  injected at runtime, rotated, audited; not a `.env` on disk.

Throughline: *Compose optimises for one developer's reproducible local env;
production optimises for availability, scale, durability, and security across
many machines, offloading the hardest "don't lose data / don't go down" parts to
managed services.* A Compose service maps almost 1:1 onto a K8s Deployment +
Service — so this is the on-ramp.
