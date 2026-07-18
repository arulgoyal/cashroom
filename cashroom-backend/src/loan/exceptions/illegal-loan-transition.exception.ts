import { ConflictException } from '@nestjs/common';
import { LoanStatus } from '../enums/loan-status.enum';
import { LoanEventType } from '../loan.machine';

/**
 * Thrown when a caller tries to move a loan through a transition the state
 * machine forbids (e.g. APPROVE a DRAFT). 409 Conflict, not 400: the request is
 * well-formed, but it conflicts with the loan's current state.
 */
export class IllegalLoanTransitionException extends ConflictException {
  constructor(from: LoanStatus, event: LoanEventType) {
    super(`Cannot apply '${event}' to a loan in status '${from}'.`);
  }
}
