import { getNextSnapshot, setup } from 'xstate';
import { LoanStatus } from './enums/loan-status.enum';

/**
 * The events (transition triggers) a loan understands. Each corresponds to a
 * real domain action ("an officer approves", "funds are disbursed").
 */
export type LoanEventType =
  | 'SUBMIT'
  | 'START_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'DISBURSE'
  | 'BEGIN_REPAYMENT'
  | 'CLOSE'
  | 'DEFAULT';

/**
 * loanMachine — the single source of truth for WHICH loan transitions are legal.
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW WE USE THIS (important, and non-obvious coming from XState-in-the-frontend):
 *
 * We do NOT run a long-lived actor per loan (`createActor(...).start()`). A loan
 * lives for months in Postgres, across many stateless HTTP requests and server
 * restarts — there is no in-memory actor to keep alive. Instead:
 *
 *   • The DB column `loans.status` is the SOURCE OF TRUTH for where a loan is.
 *   • This machine is a pure FUNCTION of (currentStatus, event) → nextStatus.
 *   • The service loads the loan, asks the machine "is this event legal from the
 *     current status?", and only if so persists the new status.
 *
 * Think of it like a validator/reducer, not a running process. The machine
 * encodes the rules once; the service enforces them. Illegal transitions (e.g.
 * APPROVE a DRAFT, or DISBURSE a REJECTED loan) are impossible to persist.
 *
 * The state keys are the LoanStatus enum values, so a status read from the DB
 * plugs straight into `resolveState({ value: status })`.
 */
export const loanMachine = setup({
  types: {
    events: {} as { type: LoanEventType },
  },
}).createMachine({
  id: 'loan',
  initial: LoanStatus.DRAFT,
  states: {
    [LoanStatus.DRAFT]: {
      on: { SUBMIT: { target: LoanStatus.SUBMITTED } },
    },
    [LoanStatus.SUBMITTED]: {
      on: { START_REVIEW: { target: LoanStatus.UNDER_REVIEW } },
    },
    [LoanStatus.UNDER_REVIEW]: {
      on: {
        APPROVE: { target: LoanStatus.APPROVED },
        REJECT: { target: LoanStatus.REJECTED },
      },
    },
    [LoanStatus.APPROVED]: {
      on: { DISBURSE: { target: LoanStatus.DISBURSED } },
    },
    [LoanStatus.DISBURSED]: {
      on: { BEGIN_REPAYMENT: { target: LoanStatus.REPAYING } },
    },
    [LoanStatus.REPAYING]: {
      on: {
        CLOSE: { target: LoanStatus.CLOSED },
        DEFAULT: { target: LoanStatus.DEFAULTED },
      },
    },
    // Terminal states: `final` means no event can move a loan out of them.
    [LoanStatus.REJECTED]: { type: 'final' },
    [LoanStatus.CLOSED]: { type: 'final' },
    [LoanStatus.DEFAULTED]: { type: 'final' },
  },
});

/**
 * Compute the status a loan would move to if `event` were applied from
 * `current` — or `null` if that transition is not allowed.
 *
 * This is the one function the service calls to guard every transition.
 *
 * Detection: from a non-terminal state, an *unhandled* event leaves the
 * machine's value unchanged (XState does not throw for unknown events). Our
 * machine has no self-transitions, so "value did not change" == "event illegal".
 * Terminal states report status 'done' and accept nothing.
 */
export function getNextStatus(
  current: LoanStatus,
  event: LoanEventType,
): LoanStatus | null {
  const snapshot = loanMachine.resolveState({ value: current });

  // Terminal state: the machine is 'done'; no transition is possible.
  if (snapshot.status === 'done') {
    return null;
  }

  // getNextSnapshot is XState v5's pure "compute the next snapshot" helper — no
  // running actor, no side effects. Perfect for a stateless validator.
  const next = getNextSnapshot(loanMachine, snapshot, { type: event });

  // Unhandled event → same value → illegal transition.
  if (next.value === current) {
    return null;
  }

  return next.value;
}
