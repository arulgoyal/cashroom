import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { bullConnectionFactory } from '../queue/bull-connection';
import { EMAIL_DLQ } from '../queue/queue.constants';
import { EmailProcessor } from './email.processor';

/**
 * WorkerModule — the root module of the SEPARATE worker process.
 * ─────────────────────────────────────────────────────────────
 * Deliberately minimal: config + a BullMQ connection + the email processor.
 * NO TypeORM/DatabaseModule — the job only logs this step, so the worker never
 * touches Postgres (keeps it lean and its failure domain small).
 *
 * `registerQueue(EMAIL_DLQ)` gives the processor a producer-side handle to push
 * exhausted jobs into. The `email` queue itself is consumed via the
 * @Processor(EMAIL_QUEUE) decorator, which stands up the Worker.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),
    BullModule.registerQueue({ name: EMAIL_DLQ }),
  ],
  providers: [EmailProcessor],
})
export class WorkerModule {}
