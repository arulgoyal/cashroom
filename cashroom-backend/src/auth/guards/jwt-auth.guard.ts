import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayloadWithTimestamps } from '../interfaces/jwt-payload.interface';

/** Request augmented with the verified token payload the guard attaches. */
export interface AuthedRequest extends Request {
  user: JwtPayloadWithTimestamps;
}

/**
 * JwtAuthGuard
 * ────────────
 * A Guard (implements CanActivate) decides whether a request reaches the handler.
 * Unlike Express middleware (`(req,res,next)` with no DI/context), a guard is
 * DI-injectable (it uses JwtService here), receives the ExecutionContext (knows
 * the target handler), and is applied declaratively with `@UseGuards`.
 *
 * It reads `Authorization: Bearer <token>`, verifies the ACCESS token, and
 * attaches the payload to `req.user`. Every failure mode → HTTP 401, but with a
 * distinct message so the client can tell expired (→ refresh) from invalid.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractBearer(request);

    // MISSING: no Authorization header or not a Bearer token.
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.jwt.verifyAsync<JwtPayloadWithTimestamps>(
        token,
        { secret: this.config.get<string>('JWT_SECRET') },
      );
      return true;
    } catch (err) {
      // EXPIRED: well-formed and correctly signed, but past `exp`. The signal to
      // the client that it should call /auth/refresh.
      if (err instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token expired');
      }
      // INVALID: bad signature, malformed, wrong algorithm, etc.
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractBearer(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' && value ? value : null;
  }
}
