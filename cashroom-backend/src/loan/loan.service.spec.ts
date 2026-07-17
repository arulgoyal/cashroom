import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LoanService } from './loan.service';
import { Loan } from './entities/loan.entity';
import { LoanStatus } from './enums/loan-status.enum';
import { InterestMethod } from './enums/interest-method.enum';
import { IllegalLoanTransitionException } from './exceptions/illegal-loan-transition.exception';

/**
 * Unit tests for LoanService. The Loan repository is mocked (no Postgres); we
 * assert the service's rules: DRAFT on create, machine-guarded transitions,
 * correct audit-timestamp stamping, and that nothing is persisted on an illegal
 * transition or a missing loan.
 */
describe('LoanService', () => {
  let service: LoanService;
  // Explicit generics so `mock.calls[...]` is typed (not `any`) — otherwise
  // reading created.status/etc. trips @typescript-eslint/no-unsafe-* in lint.
  let repo: {
    create: jest.Mock<Loan, [Partial<Loan>]>;
    save: jest.Mock<Promise<Loan>, [Loan]>;
    findOne: jest.Mock<Promise<Loan | null>, [unknown]>;
  };

  const makeLoan = (overrides: Partial<Loan> = {}): Loan =>
    Object.assign(new Loan(), {
      id: '1',
      borrowerId: '10',
      status: LoanStatus.DRAFT,
      principalPaise: '5000000',
      interestRateBps: 1200,
      tenureMonths: 12,
      interestMethod: InterestMethod.REDUCING,
      purpose: null,
      submittedAt: null,
      decidedAt: null,
      disbursedAt: null,
      closedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

  beforeEach(async () => {
    repo = {
      create: jest.fn<Loan, [Partial<Loan>]>(),
      save: jest.fn<Promise<Loan>, [Loan]>(),
      findOne: jest.fn<Promise<Loan | null>, [unknown]>(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LoanService,
        { provide: getRepositoryToken(Loan), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(LoanService);
  });

  describe('create', () => {
    it('opens the loan in DRAFT with reducing-interest default', async () => {
      repo.create.mockImplementation((d: Partial<Loan>) =>
        Object.assign(new Loan(), d),
      );
      repo.save.mockImplementation((l: Loan) =>
        Promise.resolve(Object.assign(l, { id: '1' })),
      );

      const result = await service.create({
        borrowerId: '10',
        principalPaise: '5000000',
        interestRateBps: 1200,
        tenureMonths: 12,
      });

      const created = repo.create.mock.calls[0][0];
      expect(created.status).toBe(LoanStatus.DRAFT);
      expect(created.interestMethod).toBe(InterestMethod.REDUCING);
      expect(created.purpose).toBeNull();
      expect(result.id).toBe('1');
    });
  });

  describe('applyTransition', () => {
    it('unknown loan → 404, nothing saved', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.applyTransition('999', 'SUBMIT'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('legal transition persists new status and stamps the timestamp', async () => {
      repo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.DRAFT }));
      repo.save.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.applyTransition('1', 'SUBMIT');

      expect(result.status).toBe(LoanStatus.SUBMITTED);
      expect(result.submittedAt).toBeInstanceOf(Date);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('APPROVE from UNDER_REVIEW stamps decidedAt', async () => {
      repo.findOne.mockResolvedValue(
        makeLoan({ status: LoanStatus.UNDER_REVIEW }),
      );
      repo.save.mockImplementation((l: Loan) => Promise.resolve(l));

      const result = await service.applyTransition('1', 'APPROVE');

      expect(result.status).toBe(LoanStatus.APPROVED);
      expect(result.decidedAt).toBeInstanceOf(Date);
      expect(result.submittedAt).toBeNull(); // untouched
    });

    it('illegal transition → 409, nothing saved', async () => {
      repo.findOne.mockResolvedValue(makeLoan({ status: LoanStatus.DRAFT }));

      await expect(
        service.applyTransition('1', 'APPROVE'),
      ).rejects.toBeInstanceOf(IllegalLoanTransitionException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
