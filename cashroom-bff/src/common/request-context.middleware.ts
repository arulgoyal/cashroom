import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { runWithContext } from './logging.als';

/**
 * BFF request-context middleware.
 * ───────────────────────────────
 * The BFF is the internet-facing TRUST EDGE, so it MINTS a fresh requestId and
 * ignores any client-supplied X-Request-ID (a client could otherwise forge or
 * collide ids). That id is echoed on the response and forwarded to the backend
 * (via the proxy's onProxyReq), so all three services share it. Registered before
 * the router so every log line — including throttled/401 ones — carries it.
 */
export function requestContext() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    runWithContext({ requestId }, () => next());
  };
}
