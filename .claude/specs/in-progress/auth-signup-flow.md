# Spec: auth-signup-flow
**Status:** in-progress
**Owner:** @arul.goyal
**Started:** 2026-06-15

## Goal
Implement `POST /auth/signup` (Step 4): validate input with a `SignupDto` +
class-validator, check for a duplicate email, hash the password with bcrypt, and
persist the user via `UserService`. Plus a custom "email exists" exception, a
global validation pipe + exception filter, and a Jest unit test. **No JWT** — the
endpoint creates the user and returns the safe (hash-free) user object. Doubles
as the teaching artifact (DTOs, class-validator internals, bcrypt/salt rounds,
status-code choice, filters vs try/catch, mocking).

---

## Decisions (locked with user)
- [x] **Persistence owner:** `UserService` owns `findByEmail()` + `create()`;
      `UserModule` exports `UserService`; `AuthModule` imports `UserModule`.
      AuthService never touches the repository directly.
- [x] **Password policy:** `@IsString` + `@MinLength(8)` + `@MaxLength(72)`,
      **no** complexity rules (length-first, NIST-aligned). 72 cap because bcrypt
      ignores bytes past 72.
- [x] **confirmPassword:** custom reusable `@Match('password')` class-validator
      constraint in the DTO → mismatch returns **400** before any service runs.
- [x] **No JWT** this step.
- [x] **bcrypt cost factor:** 12, read from `BCRYPT_ROUNDS` env via ConfigService
      (default 12 if unset). *(My default — flag if you want a different cost.)*
- [x] **bcrypt library:** the `bcrypt` package. *Fallback:* if the native build
      fails on Windows (node-gyp), switch to pure-JS `bcryptjs` (same algorithm,
      identical API surface for our use). Decided at install time.
- [x] **Success response:** `201 Created` with `{ id, email, role, isEmailVerified, createdAt }` — **never** `passwordHash`.

---

## Part 1 — The SignupDto & class-validator

### What a DTO is, and why validate here
A **DTO (Data Transfer Object)** is a class describing the *shape of data crossing
a boundary* — here, the JSON body of the signup request. It is not the entity
(`User`): the entity is the DB row; the DTO is the untrusted input. Keeping them
separate means the client can never set fields it shouldn't (`role`, `id`,
`isEmailVerified`).

**Why validate at this (controller/pipe) layer:** it's the *boundary*. Reject bad
input at the door, before it reaches business logic or the DB. The service can
then assume its input is already well-formed — it never re-checks "is this a valid
email." One validation point, not scattered `if` checks.

### The DTO
```ts
export class SignupDto {
  @IsEmail()            email: string;
  @IsString() @MinLength(8) @MaxLength(72)  password: string;
  @IsString() @Match('password', { message: 'passwords do not match' })
                        confirmPassword: string;
}
```

### What class-validator does under the hood
- Decorators like `@IsEmail()` don't validate on their own — they use
  `reflect-metadata` to **attach validation metadata** to the class property at
  definition time.
- Nest's **global `ValidationPipe`** intercepts the incoming request, uses
  `class-transformer` to turn the plain JSON into a `SignupDto` *instance*, then
  calls class-validator's `validate()` which **reads that metadata** and runs each
  rule.
- On failure the pipe throws `BadRequestException` (**400**) with the messages —
  the controller method never even runs. This is why `emitDecoratorMetadata` +
  `experimentalDecorators` must be on in tsconfig (they already are).

### Global ValidationPipe (main.ts)
```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // strip properties with no decorator
  forbidNonWhitelisted: true,  // 400 if the client sends unknown fields
  transform: true,             // produce real DTO instances
}));
```
`whitelist`/`forbidNonWhitelisted` are the security-relevant ones: a client
posting `{ role: 'admin' }` has it **stripped/rejected**, not silently honoured.

---

## Part 2 — AuthService.signup()

Flow: **validate (pipe, already done) → check duplicate → hash → save → return safe user.**

### Why check for duplicates BEFORE hashing (not after)
bcrypt is **deliberately slow** (that's the point — see below). Hashing first and
*then* discovering the email is taken wastes ~100ms of CPU on a request that was
always going to fail, and hands an attacker a cheap way to burn server CPU
(spam existing emails → force expensive hashes). Cheap check first, expensive work
only once we know we'll use it.

> Note: the `findByEmail` check is a **best-effort** guard, not a race-proof one.
> Two concurrent signups for the same email can both pass the check. The real
> guarantee is the **`uq_users_email` unique index** (Step 3): the second `INSERT`
> fails at the DB. So `create()` must also catch the unique-violation and map it
> to the same `EmailAlreadyExistsException`. Belt (check) **and** braces (index).

### What bcrypt does; salt rounds; why not MD5/SHA256
- **bcrypt** is a password-hashing function built on Blowfish. It does three
  things a raw hash doesn't: (1) generates a random **salt** per password and
  stores it *inside* the output string, so identical passwords get different
  hashes (defeats rainbow tables); (2) is **deliberately slow**; (3) is **tunable**.
- **Salt rounds (cost factor)** = `2^rounds` iterations. `12` → 4096 iterations.
  Each +1 **doubles** the work. We tune it so a hash takes ~100–250ms: slow enough
  to make brute-forcing stolen hashes painful, fast enough for a login request.
  As hardware gets faster, you raise the number — that's why it's configurable.
- **Why NOT MD5/SHA256:** those are *fast general-purpose* hashes — designed to be
  quick. For passwords, fast is *bad*: an attacker with a leaked DB can try
  *billions* of guesses/second on a GPU. They also have no built-in salt. bcrypt's
  slowness + per-password salt is the entire point.
- The output (`$2b$12$<22-char salt><31-char hash>`) is what goes in
  `passwordHash`. We verify later with `bcrypt.compare(plaintext, hash)`.

### HTTP status code: 409 vs 400 vs 422
- **201 Created** — success; a new resource (user) was created.
- **409 Conflict** — duplicate email. The request was *well-formed and valid*, but
  conflicts with current server state (the email already exists). This is exactly
  what 409 means → our choice.
- **400 Bad Request** — the input is *malformed/invalid* (bad email format, short
  password, passwords don't match). Handled by the ValidationPipe.
- **422 Unprocessable Entity** — syntactically valid but semantically wrong. Some
  APIs use 422 for validation failures instead of 400. We stick with Nest's
  default **400** for validation to stay consistent with the framework, and reserve
  **409** for the duplicate (a *state* conflict, not an *input* problem). The
  distinction we're drawing: **400 = your input is wrong; 409 = your input is fine
  but clashes with reality.**

---

## Part 3 — Error handling

### Custom exception
```ts
export class EmailAlreadyExistsException extends ConflictException {
  constructor() { super('An account with this email already exists.'); }
}
```
Extends Nest's `ConflictException` so it automatically carries **409**. A named
class (vs throwing `ConflictException` inline) makes the intent explicit, greppable,
and reusable, and lets tests assert on the type.

### Exception filters vs try/catch
- **try/catch** is *local*: you handle one error at one call site. Fine for
  recovering (e.g. retry), but if every controller had to `try/catch` and format
  HTTP responses, that logic would be copy-pasted everywhere.
- **Exception filters** are *global/declarative*: you `throw` a typed exception
  anywhere, and a filter centrally catches it and shapes the HTTP response. Nest
  ships a **built-in global filter** that already turns any `HttpException`
  (incl. our `ConflictException`) into the right status + JSON. So we mostly just
  `throw` — no try/catch needed for the happy/expected errors.
- We add **one small global filter** (`AllExceptionsFilter`) for the cross-cutting
  concern below: logging.

### What the client sees vs what gets logged
- **Client (409):** `{ statusCode: 409, message: "An account with this email already exists.", ... }` — clean, no internals.
- **Server log:** full context (stack, the offending email, request id) via the
  filter / Nest Logger. **Unexpected** errors (a DB outage → 500) log the full
  stack server-side but return a **generic** `500 Internal Server Error` to the
  client — never leak stack traces, SQL, or env to the caller.

> **Things to question (privacy):** returning a clear "email already exists" 409
> confirms to anyone whether an email is registered = **user enumeration**. For a
> learning app we accept it for good UX. The privacy-hard alternative: return a
> generic "check your inbox" and resolve duplicates via the email-verification
> flow. Noted, not implemented.

---

## Part 4 — Unit test (Jest)

### What mocking is & why we mock the DB
A **unit** test checks one unit (`AuthService.signup`) in isolation. We don't want
a real Postgres in a unit test: it's slow, stateful (leftover rows break reruns),
and turns a unit test into an integration test. **Mocking** = replacing a real
dependency with a fake whose behaviour we script (`findByEmail` returns `null`, or
returns an existing user). We then assert the service *did the right thing* (called
`create`, hashed the password) without any I/O. Real DB wiring is covered later by
an e2e test.

### Tests (`auth.service.spec.ts`, via `Test.createTestingModule`)
- **Happy path:** `findByEmail → null`. Assert: `create()` called once;
  the password passed to `create` is a **bcrypt hash, not the plaintext**
  (`expect(saved.passwordHash).not.toBe(dto.password)` and
  `bcrypt.compare(dto.password, saved.passwordHash)` resolves true); returned
  object has **no** `passwordHash`.
- **Duplicate email:** `findByEmail → existing user`. Assert: throws
  `EmailAlreadyExistsException`; `create()` **never** called; **no hashing happened**
  (proves the before-hashing ordering from Part 2).
- **Weak password — teaching nuance:** a weak password is rejected by the
  **ValidationPipe/DTO**, so it *never reaches the service*. Testing it against
  `AuthService.signup` would be testing the wrong layer. So this case is a
  **DTO-level test**: build a `SignupDto` with a 3-char password, run
  class-validator's `validate()`, assert a `minLength` error. (Documents *where*
  each validation actually lives.)

`UserService` is provided as a mock (`{ findByEmail: jest.fn(), create: jest.fn() }`)
and `ConfigService` mocked to return the bcrypt rounds.

---

## Files touched
- `cashroom-backend/package.json` (modified) — add `class-validator`, `class-transformer`, `bcrypt` (+ `@types/bcrypt` devDep); add `BCRYPT_ROUNDS` usage
- `cashroom-backend/.env` & `.env.example` (modified) — add `BCRYPT_ROUNDS=12`
- `cashroom-backend/src/main.ts` (modified) — global `ValidationPipe` + global `AllExceptionsFilter`
- `cashroom-backend/src/auth/dto/signup.dto.ts` (new) — `SignupDto`
- `cashroom-backend/src/common/validators/match.decorator.ts` (new) — reusable `@Match`
- `cashroom-backend/src/auth/exceptions/email-already-exists.exception.ts` (new)
- `cashroom-backend/src/common/filters/all-exceptions.filter.ts` (new) — logging + safe client shape
- `cashroom-backend/src/user/user.service.ts` (modified) — `findByEmail()`, `create()` (+ `@InjectRepository(User)`, unique-violation catch)
- `cashroom-backend/src/user/user.module.ts` (modified) — `exports: [UserService]`
- `cashroom-backend/src/auth/auth.module.ts` (modified) — `imports: [UserModule]`
- `cashroom-backend/src/auth/auth.service.ts` (modified) — `signup(dto)`
- `cashroom-backend/src/auth/auth.controller.ts` (modified) — `@Post('signup')`
- `cashroom-backend/src/auth/auth.service.spec.ts` (new) — unit tests
- `cashroom-backend/src/auth/dto/signup.dto.spec.ts` (new) — DTO validation test (weak password)

**No DB migration** — uses the existing `users` table from Step 3.

## Validation
- **Unit (`npm run test`):** `auth.service.spec.ts` (happy / duplicate) + `signup.dto.spec.ts` (weak password) pass.
- **Lint + typecheck:** `npm run lint` and `tsc --noEmit` clean before done.
- **Manual:** `npm run start:dev`, then:
  - `POST /auth/signup` valid body → **201** + safe user (no `passwordHash`); confirm in DB the stored `password_hash` is a `$2b$` bcrypt string, not plaintext.
  - same email again → **409** `EmailAlreadyExistsException`.
  - bad email / short password / mismatch → **400** with field messages.
  - extra field `{ role: 'admin' }` → stripped/**400** (whitelist), and the created user's role is still `student`.

## Rollback
- Code: delete the new files; revert the modified ones (all listed above).
- Deps: `npm uninstall class-validator class-transformer bcrypt @types/bcrypt`.
- No schema change → nothing to migrate. Any users created during testing can be deleted with a one-line SQL `DELETE` (no FKs yet).

## Risk: MEDIUM
New code only, no schema change, fully reversible — but it's a **security-sensitive
flow** (password hashing, input trust boundary), so the bcrypt usage, the
"hash never returned/logged" guarantee, and the validation-pipe config get extra
scrutiny in review.

---

## Open questions (non-blocking; resolve at implementation)
1. **bcrypt vs bcryptjs** — decided at `npm install` based on whether the native
   build succeeds on this Windows box (fallback documented above).
2. **AllExceptionsFilter scope** — log-and-reshape everything, or only catch
   unexpected (non-Http) errors and let Nest's built-in handle `HttpException`s?
   Lean: catch all, but pass through `HttpException` status/message unchanged and
   only add logging + generic 500 for the rest.
