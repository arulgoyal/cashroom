import { getNextStatus, LoanEventType } from './loan.machine';
import { LoanStatus } from './enums/loan-status.enum';

/**
 * Unit tests for the loan state machine (via the getNextStatus validator).
 * Pure function, no Nest/DB — just (status, event) → status | null.
 */
describe('loanMachine / getNextStatus', () => {
  describe('legal transitions', () => {
    const legal: [LoanStatus, LoanEventType, LoanStatus][] = [
      [LoanStatus.DRAFT, 'SUBMIT', LoanStatus.SUBMITTED],
      [LoanStatus.SUBMITTED, 'START_REVIEW', LoanStatus.UNDER_REVIEW],
      [LoanStatus.UNDER_REVIEW, 'APPROVE', LoanStatus.APPROVED],
      [LoanStatus.UNDER_REVIEW, 'REJECT', LoanStatus.REJECTED],
      [LoanStatus.APPROVED, 'DISBURSE', LoanStatus.DISBURSED],
      [LoanStatus.DISBURSED, 'BEGIN_REPAYMENT', LoanStatus.REPAYING],
      [LoanStatus.REPAYING, 'CLOSE', LoanStatus.CLOSED],
      [LoanStatus.REPAYING, 'DEFAULT', LoanStatus.DEFAULTED],
    ];

    it.each(legal)('%s + %s → %s', (from, event, expected) => {
      expect(getNextStatus(from, event)).toBe(expected);
    });
  });

  describe('illegal transitions return null', () => {
    const illegal: [LoanStatus, LoanEventType][] = [
      [LoanStatus.DRAFT, 'APPROVE'], // can't approve before review
      [LoanStatus.DRAFT, 'CLOSE'], // can't close a draft
      [LoanStatus.SUBMITTED, 'SUBMIT'], // no self-transition
      [LoanStatus.UNDER_REVIEW, 'DISBURSE'], // must be approved first
      [LoanStatus.APPROVED, 'APPROVE'], // already decided
      [LoanStatus.APPROVED, 'BEGIN_REPAYMENT'], // must disburse first
      [LoanStatus.DISBURSED, 'CLOSE'], // must be repaying first
    ];

    it.each(illegal)('%s + %s → null', (from, event) => {
      expect(getNextStatus(from, event)).toBeNull();
    });
  });

  describe('terminal states accept nothing', () => {
    const terminals: LoanStatus[] = [
      LoanStatus.REJECTED,
      LoanStatus.CLOSED,
      LoanStatus.DEFAULTED,
    ];
    const allEvents: LoanEventType[] = [
      'SUBMIT',
      'START_REVIEW',
      'APPROVE',
      'REJECT',
      'DISBURSE',
      'BEGIN_REPAYMENT',
      'CLOSE',
      'DEFAULT',
    ];

    it.each(terminals)('%s rejects every event', (from) => {
      for (const event of allEvents) {
        expect(getNextStatus(from, event)).toBeNull();
      }
    });
  });

  it('walks the full happy path DRAFT → CLOSED', () => {
    const path: [LoanEventType, LoanStatus][] = [
      ['SUBMIT', LoanStatus.SUBMITTED],
      ['START_REVIEW', LoanStatus.UNDER_REVIEW],
      ['APPROVE', LoanStatus.APPROVED],
      ['DISBURSE', LoanStatus.DISBURSED],
      ['BEGIN_REPAYMENT', LoanStatus.REPAYING],
      ['CLOSE', LoanStatus.CLOSED],
    ];

    let status: LoanStatus = LoanStatus.DRAFT;
    for (const [event, expected] of path) {
      const next = getNextStatus(status, event);
      expect(next).toBe(expected);
      status = next as LoanStatus;
    }
  });
});
