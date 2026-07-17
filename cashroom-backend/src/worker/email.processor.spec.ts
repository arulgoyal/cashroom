import { Job, Queue } from 'bullmq';
import { EmailProcessor } from './email.processor';
import { SendVerificationEmailJob } from '../queue/email-job.interface';
import { SEND_VERIFICATION_EMAIL } from '../queue/queue.constants';

/**
 * Unit tests for the EmailProcessor. No Redis/Nest — we construct the processor
 * with a mocked DLQ queue and hand it fake jobs.
 */
describe('EmailProcessor', () => {
  let dlqAdd: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
  let processor: EmailProcessor;

  const makeJob = (
    overrides: Partial<{
      data: SendVerificationEmailJob;
      attemptsMade: number;
      attempts: number;
    }> = {},
  ): Job<SendVerificationEmailJob> =>
    ({
      id: '1',
      name: SEND_VERIFICATION_EMAIL,
      data: overrides.data ?? {
        userId: '10',
        email: 's@x.com',
        verificationToken: 'tok_1234567890abcdef',
      },
      attemptsMade: overrides.attemptsMade ?? 0,
      opts: { attempts: overrides.attempts ?? 3 },
    }) as unknown as Job<SendVerificationEmailJob>;

  beforeEach(() => {
    dlqAdd = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();
    const dlq = { add: dlqAdd } as unknown as Queue;
    processor = new EmailProcessor(dlq);
  });

  describe('process (fail twice, then succeed)', () => {
    it('throws on attempt 1 (attemptsMade=0)', async () => {
      await expect(
        processor.process(makeJob({ attemptsMade: 0 })),
      ).rejects.toThrow(/transient/i);
    });

    it('throws on attempt 2 (attemptsMade=1)', async () => {
      await expect(
        processor.process(makeJob({ attemptsMade: 1 })),
      ).rejects.toThrow(/transient/i);
    });

    it('succeeds on attempt 3 (attemptsMade=2)', async () => {
      await expect(
        processor.process(makeJob({ attemptsMade: 2 })),
      ).resolves.toBeUndefined();
    });
  });

  describe('process (forceFail)', () => {
    it('always throws, even at the succeeding attempt count', async () => {
      const job = makeJob({
        attemptsMade: 2,
        data: {
          userId: '10',
          email: 's@x.com',
          verificationToken: 'tok',
          forceFail: true,
        },
      });
      await expect(processor.process(job)).rejects.toThrow(/forced/i);
    });
  });

  describe('onFailed → DLQ only on exhaustion', () => {
    it('does NOT dead-letter while retries remain', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 1, attempts: 3 }),
        new Error('boom'),
      );
      expect(dlqAdd).not.toHaveBeenCalled();
    });

    it('dead-letters once attempts are exhausted', async () => {
      const job = makeJob({ attemptsMade: 3, attempts: 3 });
      await processor.onFailed(job, new Error('boom'));

      expect(dlqAdd).toHaveBeenCalledTimes(1);
      const [, payload] = dlqAdd.mock.calls[0];
      expect(payload.original).toEqual(job.data);
      expect(payload.failedReason).toBe('boom');
      expect(payload.attemptsMade).toBe(3);
    });

    it('ignores an undefined job (BullMQ can emit failed with no job)', async () => {
      await processor.onFailed(undefined, new Error('boom'));
      expect(dlqAdd).not.toHaveBeenCalled();
    });
  });
});
