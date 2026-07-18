import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { runWithContext } from './logging.als';

/**
 * Backend request-context middleware.
 * ───────────────────────────────────
 * HONORS an inbound `X-Request-ID` (the BFF sets it) so the id is stable across
 * the BFF→backend hop and both services' logs share it. Generates one if the
 * backend is called directly (no BFF). Echoes it on the response so a client /
 * support can quote it. `runWithContext` wraps the rest of the request so every
 * downstream log line carries this requestId.
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-ID', requestId);
    runWithContext({ requestId }, () => next());
  };
}
