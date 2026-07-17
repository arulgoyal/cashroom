import type { JobsOptions } from 'bullmq';

/**
 * Queue + job names — one source of truth shared by the producer (API),
 * the consumer (worker), the DLQ handler, and the CLI. String typos in queue
 * names are silent bugs (you'd just process an empty queue forever), so we
 * never inline these literals.
 */
export const EMAIL_QUEUE = 'email';
export const EMAIL_DLQ = 'email-dlq';

/** The single job type the email queue carries (for now). */
export const SEND_VERIFICATION_EMAIL = 'send-verification-email';

/**
 * Retry policy for email jobs — shared by the producer (signup) AND the CLI
 * replay path so the two can never drift. 3 attempts, exponential backoff
 * (~1s → 2s → 4s); keep completed jobs out of Redis, keep failed ones for
 * visibility (the DLQ is the actionable copy).
 */
export const EMAIL_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: false,
};
