import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { initSentry } from '../observability/sentry';
import { WinstonLoggerService } from '../observability/winston-logger.service';

/**
 * Worker entrypoint — a SEPARATE process from the API (dist/main.js).
 * ───────────────────────────────────────────────────────────────────
 * `createApplicationContext` boots the DI container WITHOUT an HTTP server: this
 * process serves no requests, it only consumes jobs. The @Processor in
 * WorkerModule starts a BullMQ Worker whose open Redis connection keeps the
 * event loop (and thus the process) alive.
 *
 * Why a separate process/container: a stuck or CPU-heavy job can't block API
 * request handling; workers scale and deploy independently of the API.
 */
async function bootstrap() {
  initSentry(); // no-op unless SENTRY_DSN set — captures uncaught job errors

  // NOTE: no `bufferLogs` here — an application context has no HTTP `listen()` to
  // trigger the buffer flush, so buffered logs would never appear. Attach the
  // logger directly instead.
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new WinstonLoggerService(), // structured logs, same format as the API
  });
  app.enableShutdownHooks(); // clean queue drain on SIGTERM/SIGINT
  new Logger('Worker').log(
    'cashroom email worker started — consuming the "email" queue',
  );
}

void bootstrap();
