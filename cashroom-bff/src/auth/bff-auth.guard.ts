import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { isPublicPath } from './public-routes';
import { setUserId } from '../common/logging.als';

/** The access-token claims we expect (mirrors the backend's JwtPayload). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * BffAuthGuard
 * ────────────
 * Edge JWT verification. Public paths pass through untouched; every other path
 * must carry a valid access token, verified here with the SAME `JWT_SECRET` the
 * backend signs with (HS256, symmetric).
 *
 * On success it attaches the decoded payload to `req.user`; the proxy then
 * forwards it to the backend as X-User-* headers.
 *
 * DEFENSE IN DEPTH: the backend ALSO verifies the token with its own guard. So
 * why check here too? Because the BFF is the internet-facing edge — verifying
 * early means we reject bad traffic before it ever touches the backend or the
 * DB (cheaper, smaller blast radius), and the BFF is the only place that can add
 * the trusted X-User-* headers. The backend re-verifying means a bug or bypass
 * in the BFF still can't grant access. Two independent checks; neither is the
 * sole gate.
 */
@Injectable()
export class BffAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Public routes skip verification entirely.
    if (isPublicPath(req.path)) {
      return true;
    }

    const header = req.headers['authorization'];
    if (typeof header !== 'string' || header.length === 0) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token');
    }

    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      // Attach for the proxy factory to read and forward as X-User-* headers.
      (req as Request & { user?: AccessTokenPayload }).user = payload;
      // Add the authenticated userId to the request's log context.
      setUserId(payload.sub);
      return true;
    } catch (err) {
      // Mirror the backend's distinction so clients know when to refresh.
      const name = err instanceof Error ? err.name : '';
      throw new UnauthorizedException(
        name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      );
    }
  }
}
