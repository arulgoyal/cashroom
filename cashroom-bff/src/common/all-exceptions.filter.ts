import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getContext } from './logging.als';
import { captureException } from './sentry';
import { log } from './logger';

/**
 * BFF global exception filter.
 * ────────────────────────────
 * Gives BFF errors (guard 401/429, unexpected 5xx) a consistent JSON shape that
 * includes the requestId, and reports genuine 5xx to Sentry. NOTE: this replaces
 * the Step-07 behaviour where the BFF's default error shape (no timestamp/path)
 * told you the BFF rejected a request — the requestId is now the better signal.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const clientMessage = isHttp
      ? exception.getResponse()
      : 'Internal server error';
    const requestId = getContext()?.requestId;

    if (status >= 500) {
      const err = exception as Error;
      log('error', 'unhandled_error', {
        status,
        path: req.originalUrl,
        error: err.message,
        stack: err.stack,
      });
      captureException(exception); // no-op unless SENTRY_DSN set
    }

    const body =
      typeof clientMessage === 'string'
        ? { statusCode: status, message: clientMessage }
        : { statusCode: status, ...clientMessage };

    res.status(status).json({
      ...body,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}
