import * as Sentry from '@sentry/node';
import { getContext } from './logging.als';

let enabled = false;

/**
 * Initialise Sentry only if SENTRY_DSN is set — unset ⇒ no-op. Never commit a DSN.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

/** Capture an exception tagged with the current requestId/userId. */
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
