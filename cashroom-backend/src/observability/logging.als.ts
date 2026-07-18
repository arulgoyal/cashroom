import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context carried implicitly through the whole async call chain.
 * ──────────────────────────────────────────────────────────────────────────
 * AsyncLocalStorage (Node stdlib) is the key trick: a middleware calls
 * `runWithContext({requestId}, next)`, and EVERY async function that runs inside
 * that request — guards, services, the exception filter — can read the same
 * store via `getContext()`. That's how a `logger.log()` buried deep in
 * AuthService automatically knows the requestId, without threading it through
 * every function argument.
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Set the userId on the CURRENT request's context (after auth resolves it).
 * Mutates the existing store object, so log lines emitted later in the same
 * request pick it up.
 */
export function setUserId(userId: string | undefined): void {
  const ctx = storage.getStore();
  if (ctx && userId) {
    ctx.userId = userId;
  }
}
