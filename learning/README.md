# Cashroom — Learning Notes

A running log of *why* things are built the way they are, not just *how*.
One file per step. Read top to bottom to follow the project's reasoning.

## Index

| # | Topic | File |
|---|-------|------|
| 01 | Docker Compose: Postgres + Redis infrastructure | [01-docker-compose-postgres-redis.md](01-docker-compose-postgres-redis.md) |
| 02 | NestJS backend scaffold: modules, TypeORM, /health | [02-nestjs-backend-scaffold-typeorm-health.md](02-nestjs-backend-scaffold-typeorm-health.md) |
| 03 | User entity & first migration (bigint PK, role CHECK, RBAC, migrations vs synchronize) | [03-user-entity-and-first-migration.md](03-user-entity-and-first-migration.md) |
| 04 | Signup: DTO validation, bcrypt & exception handling (class-validator internals, salt rounds, 409 vs 400) | [04-signup-validation-bcrypt-exceptions.md](04-signup-validation-bcrypt-exceptions.md) |
| 05 | Signin, JWT, refresh tokens & guards (signing vs encryption, rotation, stateless auth) | [05-signin-jwt-refresh-tokens-guards.md](05-signin-jwt-refresh-tokens-guards.md) |

## Conventions
- Files are numbered in build order (`01-`, `02-`, ...).
- Each file ends with a **"Things to question"** section — deliberate critical-thinking prompts.
- Code/config that's discussed lives in the repo root; these notes explain it.
