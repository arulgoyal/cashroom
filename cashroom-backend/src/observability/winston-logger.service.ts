import { LoggerService } from '@nestjs/common';
import type { Logger as WinstonLogger } from 'winston';
import { appLogger } from './logger';

/**
 * Adapts our Winston logger to Nest's LoggerService so `app.useLogger(...)`
 * routes Nest's own bootstrap/HTTP logs — AND every `new Logger(name)` call in
 * services — through Winston (structured + ALS context). The `context` Nest
 * passes becomes a field on the record.
 */
export class WinstonLoggerService implements LoggerService {
  constructor(private readonly logger: WinstonLogger = appLogger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.logger.info(this.text(message), { context: this.context(params) });
  }

  error(message: unknown, ...params: unknown[]): void {
    // Nest calls error(message, stack?, context?).
    const [stack, context] = this.errorParams(params);
    this.logger.error(this.text(message), { context, stack });
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.logger.warn(this.text(message), { context: this.context(params) });
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.logger.debug(this.text(message), { context: this.context(params) });
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.logger.verbose(this.text(message), { context: this.context(params) });
  }

  private text(m: unknown): string {
    return typeof m === 'string' ? m : JSON.stringify(m);
  }

  private context(params: unknown[]): string | undefined {
    const last = params[params.length - 1];
    return typeof last === 'string' ? last : undefined;
  }

  private errorParams(
    params: unknown[],
  ): [string | undefined, string | undefined] {
    const strings = params.filter((p): p is string => typeof p === 'string');
    if (strings.length >= 2) return [strings[0], strings[1]];
    if (strings.length === 1) return [undefined, strings[0]];
    return [undefined, undefined];
  }
}
