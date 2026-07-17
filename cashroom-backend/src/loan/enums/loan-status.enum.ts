/**
 * LoanStatus
 * ──────────
 * The lifecycle states a Cashroom loan can occupy. This is the *vocabulary* of
 * states (lives in code); the state a given loan is in lives in the
 * `loans.status` column (per-loan data). Same split as UserRole.
 *
 * These string values are ALSO the state-node keys of the XState machine in
 * `loan.machine.ts` — the entity column and the machine speak the exact same
 * language, so a DB status can be fed straight into the machine and back.
 *
 * Stored as varchar, guarded by a DB CHECK constraint (added by hand in the
 * migration — TypeORM does not emit CHECK for a varchar+TS-enum column).
 *
 *   DRAFT ─SUBMIT→ SUBMITTED ─START_REVIEW→ UNDER_REVIEW
 *     UNDER_REVIEW ─APPROVE→ APPROVED   ─REJECT→ REJECTED (terminal)
 *     APPROVED ─DISBURSE→ DISBURSED ─BEGIN_REPAYMENT→ REPAYING
 *     REPAYING ─CLOSE→ CLOSED (terminal)   ─DEFAULT→ DEFAULTED (terminal)
 */
export enum LoanStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISBURSED = 'disbursed',
  REPAYING = 'repaying',
  CLOSED = 'closed',
  DEFAULTED = 'defaulted',
}
