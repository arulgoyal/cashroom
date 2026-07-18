import * as Sentry from '@sentry/node';
import { getContext } from './logging.als';

let enabled = false;

/**
 * Initialise Sentry — but ONLY if SENTRY_DSN is set. Unset ⇒ a no-op, so the app
 * runs identically without a Sentry project (you paste a free-tier DSN later and
 * it lights up). Never commit a real DSN.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0, // errors only this step (no performance tracing)
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Capture an exception, tagged with the current requestId + userId so the Sentry
 * issue links straight back to the exact request in your logs.
 */
export function captureException(err: unknown): void {
  if (!enabled) return;
  const ctx = getContext();
  Sentry.captureException(
    err,
    ctx
      ? { tags: { requestId: ctx.requestId }, extra: { userId: ctx.userId } }
      : undefined,
  );
}
