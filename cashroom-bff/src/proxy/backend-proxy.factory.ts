import { ConfigService } from '@nestjs/config';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { Request } from 'express';
import type { ServerResponse } from 'http';
import { AccessTokenPayload } from '../auth/bff-auth.guard';
import { log } from '../common/logger';
import { getContext } from '../common/logging.als';
import { captureException } from '../common/sentry';

/**
 * Builds the streaming reverse proxy to the backend.
 * ──────────────────────────────────────────────────
 * http-proxy-middleware pipes the raw request (method, headers, body stream)
 * to `target` and streams the response back verbatim — the BFF never parses the
 * body (that's why main.ts disables Nest's body parser).
 *
 * On each proxied request we stamp the VERIFIED identity (set by BffAuthGuard on
 * req.user) as X-User-* headers. The backend treats these as advisory context;
 * it still re-verifies the JWT itself (defense in depth).
 */
export function createBackendProxy(config: ConfigService) {
  const target = config.get<string>('BACKEND_URL') ?? 'http://localhost:3000';

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        // SECURITY: always strip any client-supplied identity headers FIRST, on
        // every route (public or protected). Otherwise a client could send
        // `X-User-Id: 999` on a public path and have it reach the backend
        // unmodified — a spoofing vector the moment anything trusts these.
        proxyReq.removeHeader('x-user-id');
        proxyReq.removeHeader('x-user-email');
        proxyReq.removeHeader('x-user-role');

        // Then set them ONLY from the token the BFF itself verified.
        const user = (req as Request & { user?: AccessTokenPayload }).user;
        if (user) {
          proxyReq.setHeader('X-User-Id', String(user.sub));
          proxyReq.setHeader('X-User-Email', String(user.email));
          proxyReq.setHeader('X-User-Role', String(user.role));
        }

        // Forward the correlation id so the backend + worker share it.
        const requestId = getContext()?.requestId;
        if (requestId) {
          proxyReq.setHeader('X-Request-ID', requestId);
        }
      },
      error: (err, _req, res) => {
        // Backend unreachable / connection reset → 502 Bad Gateway.
        log('error', 'proxy_error', { error: err.message, target });
        captureException(err); // no-op unless SENTRY_DSN set

        const serverRes = res as ServerResponse;
        if (!serverRes.headersSent) {
          serverRes.writeHead(502, { 'Content-Type': 'application/json' });
          serverRes.end(
            JSON.stringify({
              statusCode: 502,
              message: 'Bad gateway: backend unreachable',
            }),
          );
        }
      },
    },
  });
}
