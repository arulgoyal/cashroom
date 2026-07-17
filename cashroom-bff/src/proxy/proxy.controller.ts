import { All, Controller, Next, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { createBackendProxy } from './backend-proxy.factory';

/**
 * ProxyController
 * ───────────────
 * A single catch-all handler that forwards EVERY path to the backend.
 *
 * Why a controller and not plain middleware? Ordering. In NestJS, middleware
 * runs BEFORE guards — so if the proxy were middleware, it would respond before
 * ThrottlerGuard (rate limit) or BffAuthGuard (JWT) ever ran. Putting the proxy
 * in a route handler means those global guards run FIRST; only a request that
 * survives throttling + auth reaches this handler and gets forwarded.
 *
 * The route list `['/', '*path']` matches BOTH the bare root and every deeper
 * path: in path-to-regexp v8 (NestJS 11 / Express 5) the named wildcard `*path`
 * does NOT match `/` on its own, so `/` is listed explicitly. (Bare `'*'` is
 * invalid in v8.) Using @Res()/@Next() puts Nest in manual-response mode so it
 * doesn't try to serialize a return value — the proxy owns the response.
 */
@Controller()
export class ProxyController {
  private readonly proxy: ReturnType<typeof createBackendProxy>;

  constructor(config: ConfigService) {
    this.proxy = createBackendProxy(config);
  }

  @All(['/', '*path'])
  forward(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    // The proxy handler may return a promise (async pipe); we intentionally
    // don't await it — it owns the response lifecycle. `void` marks that.
    void this.proxy(req, res, next);
  }
}
