import { config } from 'dotenv';
import { Queue } from 'bullmq';
import {
  EMAIL_DLQ,
  EMAIL_JOB_OPTS,
  EMAIL_QUEUE,
  SEND_VERIFICATION_EMAIL,
} from './queue.constants';
import { SendVerificationEmailJob } from './email-job.interface';

/**
 * Standalone queue CLI (runs OUTSIDE Nest, like data-source.ts). Reads the same
 * REDIS_* env and opens its own short-lived BullMQ connections.
 *
 *   npm run queue:inspect   — job counts for both queues + list DLQ contents
 *   npm run queue:replay    — re-enqueue every DLQ job back onto `email`
 *   npm run queue:demo-dlq  — enqueue a forceFail job (exhausts retries → DLQ)
 */
config();

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function inspect(email: Queue, dlq: Queue): Promise<void> {
  console.log('email  counts:', await email.getJobCounts());
  console.log('email-dlq counts:', await dlq.getJobCounts());
  const dead = await dlq.getJobs([
    'waiting',
    'delayed',
    'active',
    'completed',
    'failed',
  ]);
  console.log(`\nDLQ jobs (${dead.length}):`);
  for (const j of dead) {
    console.log(`  #${j.id}`, JSON.stringify(j.data));
  }
}

async function replay(email: Queue, dlq: Queue): Promise<void> {
  const dead = await dlq.getJobs([
    'waiting',
    'delayed',
    'active',
    'completed',
    'failed',
  ]);
  if (dead.length === 0) {
    console.log('DLQ is empty — nothing to replay.');
    return;
  }
  for (const j of dead) {
    const payload = (j.data as { original: SendVerificationEmailJob }).original;
    await email.add(SEND_VERIFICATION_EMAIL, payload, EMAIL_JOB_OPTS);
    await j.remove();
    console.log(
      `replayed DLQ #${j.id} → email queue (user ${payload?.userId})`,
    );
  }
}

async function demoDlq(email: Queue): Promise<void> {
  const job = await email.add(
    SEND_VERIFICATION_EMAIL,
    {
      userId: 'demo',
      email: 'demo@cashroom.test',
      verificationToken: 'demo-token',
      forceFail: true,
    },
    { ...EMAIL_JOB_OPTS, backoff: { type: 'exponential', delay: 500 } },
  );
  console.log(
    `enqueued forceFail job #${job.id} — watch the worker retry 3× then dead-letter.`,
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'inspect';
  const email = new Queue(EMAIL_QUEUE, { connection });
  const dlq = new Queue(EMAIL_DLQ, { connection });
  try {
    if (cmd === 'inspect') await inspect(email, dlq);
    else if (cmd === 'replay') await replay(email, dlq);
    else if (cmd === 'demo-dlq') await demoDlq(email);
    else console.log('usage: inspect | replay | demo-dlq');
  } finally {
    await email.close();
    await dlq.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
