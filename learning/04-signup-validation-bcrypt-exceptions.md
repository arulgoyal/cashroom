# Step 04 — Signup: DTO Validation, bcrypt & Exception Handling

**Goal:** Build `POST /auth/signup` — validate the request body, reject duplicate
emails, hash the password, persist the user. No JWT yet (that's Step 5).

**Result:** valid body → `201` with the created user **minus the password hash**;
duplicate email → `409`; bad input → `400`; an injected `role: admin` field →
`400` (stripped by the whitelist). Unit + DTO tests, verified end-to-end against
the real DB (stored hash is `$2b$12$…`, never plaintext).

---

## 0. The flow in one line
**validate at the door (DTO + pipe) → check duplicate → hash → save → return a
safe (hash-free) user.**

Each stage has a "why it's *here* and not elsewhere" that's the real lesson.

---

## 1. DTOs & class-validator

### What a DTO is, and why it's not the entity
A **DTO (Data Transfer Object)** is a class describing the shape of data crossing
a boundary — here, the JSON body of the signup request. It is deliberately **not**
the `User` entity:
- The entity is the **DB row** (has `id`, `role`, `isEmailVerified`, timestamps).
- The DTO is the **untrusted input** (only `email`, `password`, `confirmPassword`).

Keeping them separate is a security control: because `role` isn't on the DTO, a
client **cannot** set it. The shapes drift apart on purpose.

### Why validate at this layer (the controller boundary)
Validation belongs at the **edge**, before business logic or the DB sees the data.
Reject garbage at the door, and every layer behind it can *assume* the input is
well-formed — no defensive re-checking scattered through services. One gate, not
ten `if`s.

### The SignupDto
```ts
export class SignupDto {
  @IsEmail()                                   email: string;
  @IsString() @MinLength(8) @MaxLength(72)     password: string;
  @IsString() @Match('password')               confirmPassword: string;
}
```
- **MinLength(8), no complexity rules** — length is the dominant strength factor;
  modern (NIST) guidance discourages forced upper/lower/symbol rules (they add
  friction and users defeat them predictably: `Password1!`).
- **MaxLength(72)** — **bcrypt silently ignores bytes past 72.** Capping makes that
  limit explicit instead of a surprise where two different long passwords "match."
- **`@Match('password')`** — a **custom** validator we wrote (see below).

### What class-validator actually does under the hood
This is the part that feels like magic but isn't:
1. Decorators like `@IsEmail()` don't validate on their own — at class-definition
   time they **attach metadata** to the property using `reflect-metadata`.
2. The global **`ValidationPipe`** intercepts the request, uses **class-transformer**
   to turn the plain JSON into a real `SignupDto` *instance*, then calls
   class-validator's `validate()`.
3. `validate()` **reads that metadata** and runs each rule. On failure the pipe
   throws `BadRequestException` (400) — **the controller method never runs.**

This is why `tsconfig` needs `emitDecoratorMetadata` + `experimentalDecorators`:
the metadata machinery depends on them.

### The global ValidationPipe (main.ts)
```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // strip properties with no decorator
  forbidNonWhitelisted: true,  // 400 if the client sends unknown fields
  transform: true,             // hand the controller a real DTO instance
}));
```
`whitelist` + `forbidNonWhitelisted` are the security-relevant pair: a body with
`{ role: 'admin' }` is **rejected**, not silently honoured. We verified this — the
injection attempt returned `400 "property role should not exist"`.

### Writing a custom validator (`@Match`)
`confirmPassword` must equal `password`. There's no built-in for "equals another
field," so we built one with `registerDecorator` + a `ValidatorConstraint` class.
It plugs into the **same metadata pipeline** as the built-ins, so a mismatch is a
normal `400` at the pipe, before any service logic. (Teaching value: it
demystifies that the built-in decorators aren't special — you can author your own.)

---

## 2. AuthService.signup — ordering and bcrypt

### Why check for duplicates BEFORE hashing
bcrypt is **deliberately slow** (~100ms at cost 12 — that's the whole point). If we
hashed first and *then* found the email was taken, we'd burn that CPU on a request
that was always going to fail — and hand an attacker a cheap way to load the server
(spam existing emails → force expensive hashes). **Cheap check first, expensive
work only once it's needed.**

### bcrypt, salt rounds, and why not MD5/SHA256
- **bcrypt** does three things a plain hash doesn't:
  1. generates a **random salt per password**, stored *inside* the output — so two
     users with the same password get different hashes (kills rainbow tables);
  2. is **deliberately slow**;
  3. is **tunable**.
- **Salt rounds (cost factor)** = `2^rounds` iterations. `12` → 4096. Each +1
  **doubles** the work. Tuned so one hash takes ~100–250ms: painful to brute-force,
  fine for a single login. As hardware speeds up, you raise the number — that's why
  it's an env var (`BCRYPT_ROUNDS`).
- **Why NOT MD5/SHA256:** they're *fast, general-purpose* hashes. For passwords,
  fast is **bad** — a GPU tries *billions* of guesses/second against a leaked DB.
  They also have no built-in salt. bcrypt's slowness + per-password salt is the
  entire reason it exists. The output (`$2b$12$<salt><hash>`) is one self-contained
  string; later we verify with `bcrypt.compare(plaintext, hash)`.

### The duplicate check is best-effort — the index is the real guarantee
`findByEmail` before insert is racy: two concurrent signups can both pass it. The
**real** guarantee is the `uq_users_email` unique index (Step 3) — the second
`INSERT` fails at the DB. So `create()` also **catches the unique-violation
(Postgres `23505`)** and maps it to the same 409. **Belt (check) and braces (index).**

---

## 3. HTTP status codes: 409 vs 400 vs 422
| Code | Meaning | Our use |
|---|---|---|
| **201 Created** | a new resource was created | signup success |
| **409 Conflict** | request is valid but conflicts with current state | **duplicate email** |
| **400 Bad Request** | input is malformed/invalid | bad email, short password, mismatch |
| **422 Unprocessable** | syntactically valid but semantically wrong | (some APIs use this for validation; we stick with Nest's 400) |

The line we drew: **400 = "your input is wrong"; 409 = "your input is fine but
clashes with reality."** A taken email isn't malformed — it conflicts — so 409.

---

## 4. Error handling: exceptions & filters

### A custom exception
```ts
export class EmailAlreadyExistsException extends ConflictException {
  constructor() { super('An account with this email already exists.'); }
}
```
Extends Nest's `ConflictException`, so it carries **409** automatically. A named
class (vs throwing inline) makes intent explicit, greppable, reusable, and
testable (`expect(...).rejects.toBeInstanceOf(EmailAlreadyExistsException)`).

### Exception filters vs try/catch
- **try/catch** is *local* — handle one error at one call site. Right when you can
  actually recover (retry, fall back). But formatting HTTP responses in every
  controller would be copy-paste everywhere.
- **Exception filters** are *global/declarative* — you `throw` a typed exception
  anywhere, and a filter centrally turns it into an HTTP response. Nest's built-in
  filter already maps any `HttpException` (incl. our `ConflictException`) to the
  right status + JSON, so we mostly just `throw`.
- We added one small **`AllExceptionsFilter`** for the cross-cutting concern below.

### What the client sees vs what gets logged
- **Client (expected error, 409):** `{ statusCode: 409, message: "...", ... }` —
  clean, no internals.
- **Server log:** full context (stack, request path) via the Logger.
- **Unexpected error (e.g. DB down):** client gets a **generic 500** with *no*
  internals (never leak stack traces / SQL / env), while the **full stack is
  logged server-side**. The split — generic to the caller, detailed to the logs —
  is the whole point of the filter.

---

## 5. Testing — and *where* each test belongs

### What mocking is & why we mock the DB
A **unit** test isolates one unit (`AuthService.signup`). We don't want real
Postgres: slow, stateful (leftover rows break reruns), and it'd make this an
*integration* test. **Mocking** = replacing a dependency with a fake whose
behaviour we script (`findByEmail → null`, or `→ existing user`). Then we assert
the service did the right thing — without any I/O.

### The tests
- **Happy path:** `findByEmail → null`; assert `create` called once, the stored
  value is a **bcrypt hash, not the plaintext**, and the returned object has **no**
  `passwordHash`.
- **Duplicate:** `findByEmail → user`; assert it throws 409 **and never hashed or
  created** (proves the before-hashing ordering).

### The non-obvious bit: "weak password" is tested at the DTO, not the service
A weak password is rejected by the **ValidationPipe before the service runs**, so
testing it against `AuthService.signup` would test the wrong layer. So that case
lives in a **DTO test** (`plainToInstance` + `validate()` — exactly what the pipe
does), asserting a `minLength` error. The lesson: **test a rule where the rule
actually lives.**

---

## Run / verify (what we did)
```powershell
npm test     # service tests (happy/duplicate) + DTO tests (weak pw/bad email/mismatch)

# manual, against the app + real Postgres
POST /auth/signup  { email, password, confirmPassword }   -> 201 (no passwordHash in body)
#   same email again                                      -> 409
#   password "abc"                                        -> 400 "at least 8 characters"
#   mismatched confirmPassword                            -> 400 "passwords do not match"
#   extra { "role":"admin" }                              -> 400 "property role should not exist"
# DB check: password_hash is a $2b$12$... string; role defaulted to 'student'
```

---

## Things to question
1. **Enumeration via 409.** Returning "email already exists" confirms to anyone
   whether an address is registered — **user enumeration**. We accept it for UX;
   the privacy-hard alternative is "check your inbox" + email verification.
   (Step 5's *signin* is enumeration-resistant — note the inconsistency.)
2. **Case-sensitive email uniqueness.** The DB index is case-sensitive; we rely on
   lowercasing in the service. Any write path that skips that normaliser breaks the
   guarantee. A `LOWER(email)` functional index or `citext` would enforce it at the DB.
3. **`select: false` is the only thing keeping the hash out of responses.** It works
   (verified), but it's a convention — a careless `addSelect` or a `find` that maps
   the raw entity could leak it. The `SafeUser` strip in the service is the second layer.
4. **No rate limiting.** Signup hammered repeatedly = free bcrypt CPU burn / spam
   accounts. A real deployment needs throttling on auth endpoints.
5. **bcrypt's 72-byte cap** is real — we cap at `MaxLength(72)`, but be aware a
   multibyte password could still approach it differently than a char count suggests.
6. **The "weak password" never reaches the service.** Good design, but it means the
   service trusts its input completely — which is only safe *because* the global
   pipe is wired. Remove the pipe and the service has no guardrail of its own.
