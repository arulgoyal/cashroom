# Step 03 — The User Entity & Our First Migration

**Goal:** Design the `users` table as a TypeORM entity, stand up the migration
tooling that didn't exist yet, and ship the first migration — *without* writing
any auth logic. Just the data shape and the machinery to evolve it safely.

**Result:** `users` table live in `cashroom_dev` (7 columns, unique email index,
a `CHECK` on `role`). `npm run migration:run` / `migration:revert` both work and
were verified against the real database.

---

## 0. The mental model for this step
Three separate things came together:
1. **An entity** — the TypeScript class that describes a row.
2. **A migration** — the versioned SQL script that actually changes the database.
3. **The CLI plumbing** — a second DB connection definition the migration tool
   uses, because the tool runs *outside* NestJS.

The big idea: **the entity is the desired shape; the migration is the explicit,
reviewable, reversible step that moves the real database toward that shape.**
They are deliberately decoupled (that's why `synchronize: false`).

---

## 1. The entity, decision by decision

### Primary key: `bigint` auto-increment (not UUID)
- `@PrimaryGeneratedColumn('increment', { type: 'bigint' })`.
- **Why bigint, not int:** a money/lending app accumulates rows for years; `int`
  caps at ~2.1 billion. `bigint` is effectively unbounded headroom for a column
  you can never cheaply widen later.
- **The gotcha that bites everyone:** TypeORM returns `bigint` as a **JS `string`**,
  not `number`. JavaScript numbers lose integer precision past 2^53; returning a
  string avoids silently corrupting a large id. So `user.id` is typed `string`.
  This is the *same reasoning the project uses for money* (store the smallest
  unit as bigint, never a float).
- **Why not UUID?** UUID is non-guessable and great for distributed/exposed ids,
  but we chose the simpler sequential key for now. Trade-off we accepted: ids are
  enumerable (user 1, 2, 3…). Revisit if ids ever get exposed in public URLs.

### `email` — `varchar(255)`, unique
- `@Index('uq_users_email', { unique: true })`. The unique index does **two jobs
  at once**: it forbids duplicate accounts *and* makes the by-email login lookup
  fast (every login does `WHERE email = ?`).
- We will lowercase emails in the service layer before saving, so `A@x.com` and
  `a@x.com` can't both register. (The DB index is case-sensitive by default;
  normalising in code is the simpler fix than a `citext`/functional index here.)

### `passwordHash` — *why the name matters*
- Named `passwordHash`, **never** `password`. The name encodes an invariant:
  what lives here is a one-way hash (bcrypt/argon2), never the plaintext. A column
  called `password` quietly invites someone to write the raw value; `passwordHash`
  makes that mistake read as obviously wrong at every call site.
- `@Column({ ..., select: false })` — the hash is **excluded from default queries**,
  so it can't accidentally leak into an API response. You must explicitly ask for
  it (e.g. `addSelect`) when verifying a login.
- **No hashing logic exists yet** — this is just the column. That's deliberate
  scope control: shape first, behaviour later.

### `role` — `varchar` + TS enum + DB `CHECK` (the decision we debated)
This was the interesting fork. The instinct (from a Mongo background) was "store
roles as an array, so they're easy to add later." We untangled two different ideas
that get conflated:

| You want to… | Needs an array? | Real solution |
|---|---|---|
| Add a new role **type** later (`instructor`) | **No** | one-line edit to the TS enum |
| Let one user hold **several roles at once** | Yes | `text[]` array *or* a join table |

Our users hold **one** role, and "easy to add new role types" is satisfied by a
plain enum. So: a single `varchar(32)` column, validated by both a TypeScript
`enum` (`UserRole`) *and* a database `CHECK (role IN ('student','admin'))`.

- **Why also a DB CHECK, not just the TS enum?** The enum guards the app; the
  CHECK guards the *database* — against a bad migration, a manual SQL edit, or a
  second service writing to the same table. Defence at the layer that actually
  stores the data. We proved it works: inserting `role='superuser'` was rejected
  by Postgres.
- **Why not a `roles` lookup table now?** That's the right destination *when a
  role needs to own data* (permissions, description). For two bare strings it adds
  a table + a join to store what is currently just a word. Promote it then, not now.
- **On latency (the question raised):** a single FK to a tiny lookup table is a
  near-free join (Postgres pins a 3-row table in memory). The join you should
  actually be wary of is a *many-to-many* (`user_roles`). But for RBAC it's mostly
  moot: the role usually rides in the **JWT**, so checks don't hit the DB per
  request at all.

### `isEmailVerified` — `boolean default false`
- `is…` prefix so it reads as a boolean at call sites. Gates actions until the
  user proves they own the address. Defaults to `false` — new accounts are
  unverified until they aren't.

### `createdAt` / `updatedAt` — and the shared `BaseEntity`
- `@CreateDateColumn()` (set once on insert) and `@UpdateDateColumn()`
  (auto-bumped on every save) — TypeORM manages them; we never set them by hand.
- These plus `id` live on an **abstract `BaseEntity`** that `User` extends.
  `abstract` = no table of its own; TypeORM copies its columns into each child.
  We built this now because `Loan` and others are coming — one place for the
  columns every table shares. `timestamptz` (with time zone) so timestamps are
  unambiguous across regions.

> **Naming:** entity properties are camelCase (`passwordHash`); DB columns are
> snake_case (`password_hash`), set explicitly with `name:` per column. Doing it
> explicitly on the first entity makes the mapping visible; a global
> `SnakeNamingStrategy` is the cleanup once the pattern is obvious.

---

## 2. Enums & RBAC — the connection
RBAC = **Role-Based Access Control**: permissions attach to *roles*, and a user
gets permissions by *holding* a role.

- **Why store the role in the DB at all (vs hardcode in code)?** Split it:
  - The **vocabulary** of roles (`student | admin`) lives in *code* (the enum) —
    cheap, type-checked, easy to extend.
  - **Which role a given user has** is per-user *data* — it changes at runtime
    (promoting a user is an `UPDATE`, not a deploy) and differs per row. You
    cannot hardcode "Arul is admin" in source.
- So: vocabulary in code, assignment in the row. This `role` column is the link
  between a user and their future permission set. Later, a NestJS **guard** will
  read `user.role` (from the JWT) and allow/deny each route. We only laid the
  data foundation here — no guard yet.

---

## 3. Migrations — what and why

- **What is a migration?** A versioned script with `up()` (apply) and `down()`
  (undo), committed to git, run in order. TypeORM records which have run in a
  `migrations` table, so every environment (laptop, CI, prod) converges to the
  *same* schema by replaying the *same* ordered steps.
- **Why not `synchronize: true`?** `synchronize` diffs entities vs the live DB on
  every boot and auto-applies the difference — which **can silently DROP a column
  and its data**. For a lending ledger that's unacceptable. (Step 02 already set
  `synchronize: false` for exactly this reason.) Migrations make every change
  **reviewable in a PR, ordered, and reversible**.

### The plumbing we had to build (none existed)
- **`src/database/data-source.ts`** — a standalone `DataSource`. The app's runtime
  connection is built by NestJS DI (`forRootAsync`), but the **CLI runs outside
  Nest** — there's no DI at a command prompt. So the CLI needs its own connection
  definition pointing at the entity + migration file globs. It loads `.env` via
  `dotenv` because, again, there's no Nest `ConfigModule` at the CLI.
- **npm scripts** (`package.json`) using the `typeorm-ts-node-commonjs` binary, so
  migrations run as TypeScript with no separate build step:
  ```
  migration:generate  — diff entities vs DB → write a timestamped migration
  migration:run       — apply pending migrations
  migration:revert    — undo the last applied migration
  migration:show      — list [X] applied / [ ] pending
  ```

### What the generator gave us — and what it didn't
`migration:generate` produced the `CREATE TABLE`, the unique email index, and the
PK. It did **not** emit the `CHECK` constraint — because a `varchar` column with a
*TypeScript* enum looks like a plain string to the schema differ. So we **read the
generated SQL** and hand-added:
```sql
ALTER TABLE "users" ADD CONSTRAINT "chk_users_role"
  CHECK ("role" IN ('student','admin'));
```
plus a matching `DROP CONSTRAINT` at the top of `down()`. **Lesson: always read a
generated migration before running it — the generator captures structure, not
every business rule.**

### Verified end-to-end (not assumed)
- `migration:run` → table created inside a `START TRANSACTION … COMMIT` (so a
  failure rolls the whole migration back, never half-applies).
- `\d users` in the container confirmed every column, type, default, the unique
  index, and the CHECK.
- `INSERT ... role='superuser'` → **rejected by Postgres** (CHECK works).
- `migration:revert` → table dropped, `migration:show` flipped to `[ ]`; re-ran to
  leave it applied.

---

## 4. Team scenario — two devs, same entity, no migrations
*(Why migrations matter the moment there's more than one of you.)*

With `synchronize: true` and no migrations:
- Dev A adds `phoneNumber`; Dev B renames `isEmailVerified` → `emailVerified`.
  Each boots locally and `synchronize` reshapes *their own* DB to match *their*
  branch. There is **no shared, ordered record** of what changed.
- On merge, nothing reconciles the two. Whoever boots next lets `synchronize`
  auto-alter the DB to the merged entities — possibly **dropping a column (and its
  data)** the other person relied on. No review, no rollback, no audit trail.
- Environments drift: each DB's schema depends on *which entity version booted
  last*, not on an agreed sequence. Result: "works on my machine."

With migrations: each dev commits a **timestamped** migration. Git shows the
ordering, the SQL diff is **reviewed in the PR**, conflicts are explicit, runs are
recorded in the `migrations` table, and every change is reversible via `down()`.

---

## Run / verify (what we did)
```powershell
cd cashroom-backend
npm run migration:generate -- src/database/migrations/CreateUsersTable
npm run migration:run
npm run migration:show          # [X] CreateUsersTable...
# verify in the container:
docker exec cashroom-postgres psql -U cashroom -d cashroom_dev -c "\d users"
npm run migration:revert        # demonstrate rollback
npm run migration:run           # re-apply, leave it in place
```

---

## Things to question
1. **Sequential bigint ids are enumerable.** Fine internally; if an id ever lands
   in a public URL or API response, an attacker can guess `/users/1, /2, /3` and
   probe how many users exist. The day ids go public, reconsider UUIDs (or a
   separate public slug).
2. **The rejected test insert burned `id=1`.** Postgres sequences are *not*
   gap-free by design — a failed/rolled-back insert still advances the counter.
   The first real user starts at `id=2`. Don't ever treat ids as a row count.
3. **CHECK vs native PG enum.** We chose `varchar + CHECK` so adding a role later
   is a tiny migration. A native PG `ENUM` type is stricter but painful to alter.
   If the role set ever stabilises hard, revisit — but flexibility wins for now.
4. **`data-source.ts` duplicates connection config** from `database.module.ts`.
   Two places that must agree on host/credentials/`synchronize`. Acceptable
   trade (the CLI genuinely can't use Nest DI); just keep them in sync, and be
   suspicious if one is edited without the other.
5. **`email` uniqueness is case-sensitive at the DB.** We rely on lowercasing in
   code. If any path writes an email *without* going through that normaliser, the
   guarantee leaks. A functional unique index (`LOWER(email)`) or `citext` would
   enforce it at the DB — revisit if a second writer appears.
6. **No `User` repository/service logic yet.** The entity is registered
   (`forFeature([User])`) but nothing reads or writes it. That's the next step —
   and the first place real validation and the email-normalisation rule live.
