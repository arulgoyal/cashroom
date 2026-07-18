import { NextFunction, Request, Response } from 'express';
import { log, LogLevel } from './logger';

/**
 * requestLogger
 * ─────────────
 * Express-level middleware that logs one structured record PER request:
 * method, path, status, and duration. Registered via `app.use()` in main.ts so
 * it runs BEFORE Nest's guards/router — meaning it logs *everything*, including
 * requests that get 429'd (rate-limited) or 401'd (rejected) before reaching a
 * controller.
 *
 * We log on the response's `finish` event (not up-front) because status and
 * duration only exist once the response is done.
 *
 * WHY DURATION MATTERS: latency is the earliest, clearest signal of trouble — a
 * slow dependency, an N+1 query, a lock. A status code tells you *that* it
 * failed; duration often tells you *why* it's about to. We measure with
 * `hrtime.bigint()` (monotonic) rather than Date.now() so a clock adjustment
 * can't produce a negative or skewed duration.
 *
 * The `emit` param is injectable so unit tests can assert what was logged.
 */
export function requestLogger(emit: typeof log = log) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs =
        Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
      const level: LogLevel =
        res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info';

      emit(level, 'request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      });
    });

    next();
  };
}
