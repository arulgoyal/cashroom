import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EMAIL_DLQ, EMAIL_QUEUE } from './queue/queue.constants';
import { initSentry } from './observability/sentry';
import { WinstonLoggerService } from './observability/winston-logger.service';
import { requestContext } from './observability/request-context.middleware';

async function bootstrap() {
  // Sentry FIRST (no-op unless SENTRY_DSN set), before anything can throw.
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // hold bootstrap logs until our logger is attached
  });

  // Route ALL Nest logs (bootstrap, HTTP, every `new Logger(...)`) through Winston.
  app.useLogger(new WinstonLoggerService());

  // Establish per-request context (requestId → ALS) FIRST, before the router, so
  // every downstream log line carries it. Honors an inbound X-Request-ID from the BFF.
  app.use(requestContext());

  // Validate every request body against its DTO before the controller runs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties that have no validation decorator
      forbidNonWhitelisted: true, // 400 if the client sends unknown fields
      transform: true, // hand the controller a real DTO instance
    }),
  );

  // One declarative error boundary: clean responses to clients, full logs server-side.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Bull Board — queue dashboard at /admin/queues. Reuses the app's existing
  // Queue instances (no extra Redis connections). strict:false lets us pull the
  // `email` queue that's registered in AuthModule, not AppModule.
  // NOTE: unauthenticated — fine for local dev; MUST be protected in production
  // (and it's behind the BFF's JWT check if reached via :3001).
  const emailQueue = app.get<Queue>(getQueueToken(EMAIL_QUEUE), {
    strict: false,
  });
  const dlqQueue = app.get<Queue>(getQueueToken(EMAIL_DLQ), { strict: false });
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(dlqQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', serverAdapter.getRouter());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
