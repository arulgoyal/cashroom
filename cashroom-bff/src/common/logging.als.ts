import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context (requestId, userId) carried implicitly through the async
 * call chain via AsyncLocalStorage, so every log line in a request can include
 * them without being passed the values explicitly. See the backend's copy for
 * the fuller explanation — same pattern, mirrored here for the BFF.
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

export function setUserId(userId: string | undefined): void {
  const ctx = storage.getStore();
  if (ctx && userId) {
    ctx.userId = userId;
  }
}
