# Spec: loan-domain-and-state-machine

**Status:** in-progress
**Owner:** @arulgoyal
**Started:** 2026-07-17

## Goal
Model the core Loan aggregate for Cashroom: a `Loan` entity mapped to a new
`loans` table, a lifecycle **state machine** (XState) that defines the legal
transitions a loan may take, money/interest/tenure fields using the project's
`bigint`-paise + basis-points conventions, and the first loan migration. This
establishes the domain heart of the product; repayment schedule, ledger, and
disbursement records are explicitly **out of scope** and come in later steps.

The step teaches: aggregate modelling, enum-as-varchar + DB CHECK, money as
`bigint`, and — the crux — **using an XState machine as a pure transition
validator in a stateless backend** (DB is source of truth; machine authorises
transitions), not as a long-lived per-loan actor.

## Decisions
- [x] **Scope = Loan aggregate only** (user: "according to the plan" → interpreted
      as the incremental one-concept-per-step cadence of Steps 01–05).
      Repayment schedule / ledger / disbursement deferred to later steps.
- [x] **Lifecycle = standard lending** (user-selected):
      `DRAFT → SUBMITTED → UNDER_REVIEW → (APPROVED | REJECTED)`,
      `APPROVED → DISBURSED → REPAYING → (CLOSED | DEFAULTED)`.
      Terminal: `REJECTED`, `CLOSED`, `DEFAULTED`.
- [x] **Interest = reducing-balance, rate in basis points** (user-selected).
      Fields modelled now; EMI/accrual math deferred to the repayment step.
- [x] **XState usage = transition validator**, not a persisted actor. Service
      computes `nextStatus = machine.transition(current, event)`; if the event
      is not accepted from the current state, reject with a domain error and do
      not persist.
- [x] **Money = `bigint` paise, typed `string` in TS** (matches BaseEntity/id
      rationale and the project money rule). Rate = integer basis points
      (1200 = 12.00%). Tenure = integer months.
- [x] **Enums stored as `varchar` + hand-written DB `CHECK`** (TypeORM does not
      emit CHECK for varchar+TS-enum — same pattern as `chk_users_role`).
- [x] **Borrower link = real FK** `borrower_id → users(id)` with a `@ManyToOne`
      relation, an index, and `ON DELETE RESTRICT` (never orphan a loan; never
      let a user with loans be hard-deleted).
- [x] **Lifecycle audit timestamps** (`submitted_at`, `decided_at`,
      `disbursed_at`, `closed_at`, all nullable `timestamptz`) — cheap, and they
      teach transition auditing. Set by the service on the matching transition.
- [x] **API surface = domain only this step** (user-approved). Service layer
      (`createDraft`, `applyTransition`) + unit tests now; REST endpoints
      (apply/approve/disburse + RBAC guards) deferred to **Step 07**.
- [x] **`purpose` field = included** (user-approved). Nullable `varchar(500)`.

## Files touched
- `cashroom-backend/src/loan/enums/loan-status.enum.ts` (new)
- `cashroom-backend/src/loan/enums/interest-method.enum.ts` (new)
- `cashroom-backend/src/loan/entities/loan.entity.ts` (new)
- `cashroom-backend/src/loan/loan.machine.ts` (new — XState machine + typed events)
- `cashroom-backend/src/loan/loan.service.ts` (modified — createDraft + applyTransition)
- `cashroom-backend/src/loan/loan.module.ts` (modified — `TypeOrmModule.forFeature([Loan])`)
- `cashroom-backend/src/database/migrations/<ts>-CreateLoansTable.ts` (new)
- `cashroom-backend/src/loan/loan.machine.spec.ts` (new — legal/illegal transitions)
- `cashroom-backend/src/loan/loan.service.spec.ts` (new — createDraft + transition guarding)
- `cashroom-backend/package.json` (modified — add `xstate` dependency)
- `learning/06-loan-domain-state-machine.md` (new — local-only note; `learning/` is gitignored)

## Validation
- **Unit:** machine accepts every legal transition and rejects illegal ones
  (e.g. `APPROVE` from `DRAFT` → rejected; `DISBURSE` from `APPROVED` → ok).
  Terminal states accept no events. `applyTransition` persists new status +
  stamps the right timestamp; illegal transition throws and persists nothing.
- **Integration:** `npm run migration:run` applies cleanly; `migration:revert`
  drops the table cleanly (up/down symmetry). Insert a loan row via the CLI/service.
- **Manual:** `npx tsc --noEmit` clean; `npm test` green; `migration:show` lists
  the new migration as applied.

## Rollback
- Code: `git revert` the step's commit (all changes are additive/new files).
- Schema: `npm run migration:revert` runs the migration `down()` which drops the
  `loans` table, its indexes, FK, and CHECK constraints. No other table is
  touched, so no data migration/backfill to unwind.

## Risk: MEDIUM
New domain core + new table + new dependency (XState), but strictly **additive**:
no change to existing tables, no backfill, and the feature is not yet exposed via
any route, so nothing in production depends on it until Step 07.
