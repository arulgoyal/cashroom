import { createLogger, format, Logger, transports } from 'winston';
import { getContext } from './logging.als';

const SERVICE = 'cashroom-backend';

/**
 * Injects the current request's ALS context (requestId, userId) into every log
 * record — this is what puts the correlation id on every line for free.
 */
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

/** Human-readable single line for local dev. */
const prettyLine = format.printf((info) => {
  const rec = info as unknown as Record<string, unknown>;
  const known = new Set([
    'timestamp',
    'level',
    'message',
    'context',
    'requestId',
    'userId',
    'service',
    'stack',
    'splat',
  ]);
  const rest = Object.fromEntries(
    Object.entries(rec).filter(([k]) => !known.has(k)),
  );
  const label = `[${str(rec.context ?? rec.service ?? SERVICE)}]`;
  const corr = rec.requestId
    ? ` (req=${str(rec.requestId).slice(0, 8)}${rec.userId ? ` user=${str(rec.userId)}` : ''})`
    : '';
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  const line = `${str(rec.timestamp)} ${str(rec.level)} ${label}${corr} ${str(rec.message)}${extras}`;
  return rec.stack ? `${line}\n${str(rec.stack)}` : line;
});

/**
 * Choose format by env: JSON in production (LOG_FORMAT=json or NODE_ENV=production)
 * for machine parsing; pretty colorized in dev for human eyes.
 */
function chooseFormat() {
  const json =
    process.env.LOG_FORMAT === 'json' ||
    (!process.env.LOG_FORMAT && process.env.NODE_ENV === 'production');
  const base = format.combine(injectContext(), format.timestamp());
  return json
    ? format.combine(base, format.json())
    : format.combine(base, format.colorize(), prettyLine);
}

export function createAppLogger(): Logger {
  return createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service: SERVICE },
    format: chooseFormat(),
    transports: [new transports.Console()],
  });
}

/** Shared singleton used by the Nest LoggerService and any direct callers. */
export const appLogger = createAppLogger();
