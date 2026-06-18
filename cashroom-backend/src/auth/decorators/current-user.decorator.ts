import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from '../guards/jwt-auth.guard';
import { JwtPayloadWithTimestamps } from '../interfaces/jwt-payload.interface';

/**
 * @CurrentUser() — pulls the verified token payload that JwtAuthGuard attached to
 * `req.user`, so handlers receive it as a parameter instead of digging into the
 * raw request. Only meaningful on routes protected by JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayloadWithTimestamps => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return request.user;
  },
);
