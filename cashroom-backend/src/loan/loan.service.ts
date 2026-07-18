import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Loan } from './entities/loan.entity';
import { LoanStatus } from './enums/loan-status.enum';
import { InterestMethod } from './enums/interest-method.enum';
import { getNextStatus, LoanEventType } from './loan.machine';
import { IllegalLoanTransitionException } from './exceptions/illegal-loan-transition.exception';

/** The data needed to open a new loan application (always starts as DRAFT). */
export interface CreateLoanDraftData {
  borrowerId: string;
  principalPaise: string;
  interestRateBps: number;
  tenureMonths: number;
  purpose?: string | null;
  interestMethod?: InterestMethod;
}

/**
 * Which audit timestamp (if any) a given transition event stamps. Kept next to
 * the service because it's a persistence concern, not a machine concern — the
 * machine only knows about *states*, not about our audit columns.
 */
const TIMESTAMP_FOR_EVENT: Partial<Record<LoanEventType, keyof Loan>> = {
  SUBMIT: 'submittedAt',
  APPROVE: 'decidedAt',
  REJECT: 'decidedAt',
  DISBURSE: 'disbursedAt',
  CLOSE: 'closedAt',
  DEFAULT: 'closedAt',
};

/**
 * LoanService
 * ───────────
 * Single owner of reads/writes to the `loans` table, and the ONLY place a
 * loan's status is allowed to change — always through `applyTransition`, which
 * defers to the state machine for legality.
 */
@Injectable()
export class LoanService {
  constructor(
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
  ) {}

  /** Open a new loan application. Always starts in DRAFT. */
  create(data: CreateLoanDraftData): Promise<Loan> {
    const loan = this.loans.create({
      borrowerId: data.borrowerId,
      principalPaise: data.principalPaise,
      interestRateBps: data.interestRateBps,
      tenureMonths: data.tenureMonths,
      purpose: data.purpose ?? null,
      interestMethod: data.interestMethod ?? InterestMethod.REDUCING,
      status: LoanStatus.DRAFT,
    });
    return this.loans.save(loan);
  }

  /** Lookup by primary key. */
  findById(id: string): Promise<Loan | null> {
    return this.loans.findOne({ where: { id } });
  }

  /**
   * Move a loan through a lifecycle transition.
   *
   * Load → ask the machine if `event` is legal from the current status →
   * persist the new status (+ stamp the matching audit timestamp) only if so.
   * Illegal transition → 409; unknown loan → 404.
   *
   * CONCURRENCY NOTE: this is a read-modify-write. Two simultaneous transitions
   * on the same loan could both read the old status and both write. There are no
   * concurrent callers yet (no API until Step 07); when the API lands we'll make
   * this safe with a conditional UPDATE (`WHERE id = ? AND status = ?`) or the
   * project's Redis lock helper. Flagged, not solved, on purpose.
   */
  async applyTransition(loanId: string, event: LoanEventType): Promise<Loan> {
    const loan = await this.loans.findOne({ where: { id: loanId } });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const next = getNextStatus(loan.status, event);
    if (next === null) {
      throw new IllegalLoanTransitionException(loan.status, event);
    }

    loan.status = next;

    const stampField = TIMESTAMP_FOR_EVENT[event];
    if (stampField) {
      // Assign the audit timestamp for this milestone.
      (loan[stampField] as Date) = new Date();
    }

    return this.loans.save(loan);
  }
}
