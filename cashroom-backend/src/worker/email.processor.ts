import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Job, Queue } from 'bullmq';
import { EMAIL_DLQ, EMAIL_QUEUE } from '../queue/queue.constants';
import { SendVerificationEmailJob } from '../queue/email-job.interface';
import { runWithContext } from '../observability/logging.als';

/**
 * EmailProcessor
 * ──────────────
 * `@Processor(EMAIL_QUEUE)` makes this a BullMQ *Worker* (consumer) for the
 * `email` queue. In BullMQ the producer (Queue.add) and consumer (Worker) are
 * separate — this class is the consumer half, running in the worker process.
 *
 * SIMULATION: to demonstrate retries+backoff without a real provider, the first
 * two attempts throw and the third succeeds. `attemptsMade` is 0 on the first
 * run, 1 on the second, 2 on the third — so `< 2` fails twice then succeeds.
 * A `forceFail` payload flag always throws, to demonstrate the DLQ.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(@InjectQueue(EMAIL_DLQ) private readonly dlq: Queue) {
    super();
  }

  async process(job: Job<SendVerificationEmailJob>): Promise<void> {
    // Restore the enqueuing request's correlation id so this worker's log lines
    // link back to the original signup request (end-to-end tracing).
    return runWithContext(
      {
        requestId: job.data.requestId ?? randomUUID(),
        userId: job.data.userId,
      },
      () => this.handle(job),
    );
  }

  private async handle(job: Job<SendVerificationEmailJob>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    const attempt = job.attemptsMade + 1;
    this.logger.log(
      `Processing ${job.name} #${job.id} (attempt ${attempt}/${maxAttempts}) for ${job.data.email}`,
    );

    if (job.data.forceFail) {
      throw new Error('Forced failure (demo): will exhaust retries → DLQ');
    }

    if (job.attemptsMade < 2) {
      throw new Error(
        `Simulated transient email-provider failure (attempt ${attempt})`,
      );
    }

    // The "send". A real provider call (await provider.send(...)) goes here — and
    // must be idempotent, since at-least-once delivery means this handler can run
    // more than once per job. We await a resolved promise to stand in for that.
    await Promise.resolve();
    this.logger.log(
      `Would send email to ${job.data.email} (token ${job.data.verificationToken.slice(0, 12)}…)`,
    );
  }

  /**
   * Fires after EVERY failed attempt. We only dead-letter once retries are
   * exhausted (attemptsMade has reached the configured max) — otherwise BullMQ
   * is still going to retry with backoff.
   */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<SendVerificationEmailJob> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;
    // Same correlation id as the processing attempt, so the DLQ/retry logs group
    // with the rest of the request.
    return runWithContext(
      {
        requestId: job.data.requestId ?? randomUUID(),
        userId: job.data.userId,
      },
      () => this.handleFailure(job, err),
    );
  }

  private async handleFailure(
    job: Job<SendVerificationEmailJob>,
    err: Error,
  ): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `#${job.id} exhausted ${maxAttempts} attempts → moving to DLQ (${EMAIL_DLQ})`,
      );
      await this.dlq.add('dead-letter', {
        original: job.data,
        failedReason: err.message,
        attemptsMade: job.attemptsMade,
        deadLetteredAt: new Date().toISOString(),
      });
    } else {
      this.logger.warn(
        `#${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed: ${err.message} — retrying with backoff`,
      );
    }
  }
}
