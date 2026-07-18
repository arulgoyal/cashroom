import { createLogger, format, transports } from 'winston';
import { getContext } from './logging.als';

/**
 * Structured logger backed by Winston.
 * ────────────────────────────────────
 * Keeps the same `log(level, message, fields)` signature the rest of the BFF
 * already uses (request-logger, proxy factory), so nothing else changes — but now
 * output is JSON in production / pretty in dev, and every line automatically
 * carries the current request's `requestId` + `userId` from AsyncLocalStorage.
 */
export type LogLevel = 'info' | 'warn' | 'error';

const SERVICE = 'cashroom-bff';

const injectContext = format((info) => {
  const ctx = getContext();
  if (ctx) {
    info.requestId = ctx.requestId;
    if (ctx.userId) info.userId = ctx.userId;
  }
  return info;
});

/** Safely stringify an unknown log field (never "[object Object]"). */
const str = (v: unknown): string =>
  typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

const prettyLine = format.printf((info) => {
  const rec = info as unknown as Record<string, unknown>;
  const known = new Set([
    'timestamp',
    'level',
    'message',
    'requestId',
    'userId',
    'service',
    'splat',
  ]);
  const rest = Object.fromEntries(
    Object.entries(rec).filter(([k]) => !known.has(k)),
  );
  const corr = rec.requestId
    ? ` (req=${str(rec.requestId).slice(0, 8)}${rec.userId ? ` user=${str(rec.userId)}` : ''})`
    : '';
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${str(rec.timestamp)} ${str(rec.level)} [${str(rec.service ?? SERVICE)}]${corr} ${str(rec.message)}${extras}`;
});

function chooseFormat() {
  const json =
    process.env.LOG_FORMAT === 'json' ||
    (!process.env.LOG_FORMAT && process.env.NODE_ENV === 'production');
  const base = format.combine(injectContext(), format.timestamp());
  return json
    ? format.combine(base, format.json())
    : format.combine(base, format.colorize(), prettyLine);
}

const winstonLogger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: SERVICE },
  format: chooseFormat(),
  transports: [new transports.Console()],
});

export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  winstonLogger.log(level, message, fields);
}
