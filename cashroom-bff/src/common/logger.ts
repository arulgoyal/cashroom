/**
 * Minimal structured logger.
 * ──────────────────────────
 * Emits ONE JSON object per line ("structured logging") instead of free-text
 * `console.log`. Why it matters: log aggregators (Loki, ELK, CloudWatch) parse
 * JSON fields, so you can query `status>=500` or `durationMs>1000` across
 * millions of lines. A `console.log('user 5 did X in 20ms')` string is invisible
 * to those queries — you'd need fragile regex. Fields > prose.
 *
 * The project's target stack uses Winston; this tiny logger keeps the BFF step
 * focused. Swapping in Winston later means replacing this one file.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'cashroom-bff',
    ...fields,
  });
  // errors → stderr, everything else → stdout (standard stream hygiene).
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}
