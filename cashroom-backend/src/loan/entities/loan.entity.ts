import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../user/entities/user.entity';
import { LoanStatus } from '../enums/loan-status.enum';
import { InterestMethod } from '../enums/interest-method.enum';

/**
 * Loan
 * ────
 * The core Cashroom aggregate. Maps to the `loans` table. Inherits `id`,
 * `createdAt`, `updatedAt` from BaseEntity.
 *
 * This is the DATA shape + relations only. The rules for *how* a loan moves
 * between statuses live in `loan.machine.ts`; the service enforces them.
 */
@Entity('loans')
export class Loan extends BaseEntity {
  /**
   * FK to the student who owns the loan. We expose the raw id as a scalar
   * column (so the service can set/read it without loading a full User) AND a
   * lazy relation for when we do need the joined row. Both map to the same
   * `borrower_id` column — a standard TypeORM pattern.
   */
  @Index('idx_loans_borrower')
  @Column({ name: 'borrower_id', type: 'bigint' })
  borrowerId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'borrower_id' })
  borrower?: User;

  /**
   * Where the loan is in its lifecycle. Defaults to DRAFT. The allowed set is
   * enforced by the LoanStatus enum, the XState machine (transitions), AND a DB
   * CHECK constraint (values) added in the migration.
   */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: LoanStatus.DRAFT,
  })
  status: LoanStatus;

  /**
   * Principal in PAISE (the smallest unit), as bigint. Typed `string` in TS for
   * the same reason as the id: a bigint can exceed JS's safe-integer range, so
   * TypeORM returns it as a string to avoid silent precision loss. Money is
   * NEVER a JS `number` in this codebase.
   */
  @Column({ name: 'principal_paise', type: 'bigint' })
  principalPaise: string;

  /**
   * Annual interest rate in BASIS POINTS (integer). 1 bp = 0.01%, so
   * 1200 = 12.00%. Storing an integer avoids floating-point rounding on a money
   * figure; percentages are only for display.
   */
  @Column({ name: 'interest_rate_bps', type: 'int' })
  interestRateBps: number;

  /** Loan term in whole months. */
  @Column({ name: 'tenure_months', type: 'int' })
  tenureMonths: number;

  /** How interest accrues. Only 'reducing' today; see InterestMethod. */
  @Column({
    name: 'interest_method',
    type: 'varchar',
    length: 16,
    default: InterestMethod.REDUCING,
  })
  interestMethod: InterestMethod;

  /** Free-text reason the loan funds (e.g. "Semester 4 tuition"). Optional. */
  @Column({ name: 'purpose', type: 'varchar', length: 500, nullable: true })
  purpose: string | null;

  // ── Lifecycle audit timestamps ─────────────────────────────────────────────
  // Set by the service on the matching transition; null until then. They give a
  // cheap audit trail of WHEN each milestone happened, distinct from the audit
  // of WHAT changed (updated_at).

  /** When the applicant submitted the draft (SUBMIT). */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /** When a decision was made (APPROVE or REJECT). */
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** When funds were disbursed (DISBURSE). */
  @Column({ name: 'disbursed_at', type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  /** When the loan reached a terminal repayment outcome (CLOSE or DEFAULT). */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
