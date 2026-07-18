import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { setUserId } from './logging.als';

/**
 * Interceptors run AFTER guards, so `req.user` (set by JwtAuthGuard) exists here.
 * We write its `sub` into the same ALS store the middleware created, so every log
 * line from this point on in the request also carries the userId. Runs within the
 * request's ALS context, so the mutation sticks.
 */
@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub?: string } }>();
    if (req.user?.sub) {
      setUserId(req.user.sub);
    }
    return next.handle();
  }
}
