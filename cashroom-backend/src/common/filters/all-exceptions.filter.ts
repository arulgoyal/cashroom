import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getContext } from '../../observability/logging.als';
import { captureException } from '../../observability/sentry';

/**
 * AllExceptionsFilter
 * ───────────────────
 * A global, declarative error boundary. Instead of try/catch in every controller,
 * code anywhere just `throw`s; this filter centrally decides what the CLIENT sees
 * vs what gets LOGGED.
 *
 *  - Expected errors (HttpException, incl. our 409): pass the real status/message
 *    through to the client. Logged at `warn` (not a server fault).
 *  - Unexpected errors (DB down, bugs → not HttpException): the client gets a
 *    GENERIC 500 with no internals (never leak stack traces / SQL / env), while
 *    the FULL stack is logged server-side at `error` for debugging.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // What the client sees.
    const clientMessage = isHttp
      ? exception.getResponse()
      : 'Internal server error';

    // What gets logged (full detail, server-side only). The logger adds the
    // requestId automatically from ALS; we also surface it in the response.
    const requestId = getContext()?.requestId;
    const where = `${request.method} ${request.url}`;
    // Gate on the STATUS, not on HttpException-ness: a thrown 500-status
    // HttpException is still a server incident. 5xx → error log + Sentry; 4xx →
    // warn (normal client errors, not incidents). Sentry is a no-op without a DSN.
    if (status >= 500) {
      const err = exception as Error;
      this.logger.error(`${status} ${where} — ${err.message}`, err.stack);
      captureException(exception);
    } else {
      this.logger.warn(`${status} ${where} — ${JSON.stringify(clientMessage)}`);
    }

    const body =
      typeof clientMessage === 'string'
        ? { statusCode: status, message: clientMessage }
        : { statusCode: status, ...clientMessage };

    response.status(status).json({
      ...body,
      requestId, // let the client/support quote this to find the exact request
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
