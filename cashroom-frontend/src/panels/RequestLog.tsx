import { useEffect, useReducer, useState } from 'react';
import { clearLog, getEntries, subscribe } from '../instrumentation/requestLog';

/**
 * The built-in, annotated Network tab. Every call `fetchJson` makes shows up
 * here (newest first): method, path, status, duration, and the X-Request-ID that
 * correlates to the backend logs. Click a row to see the raw request/response.
 */
export function RequestLog() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => subscribe(force), [force]);

  const entries = getEntries();
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const statusClass = (s: number | null) =>
    s === null ? 'status-0' : `status-${Math.floor(s / 100)}`;

  return (
    <section className="panel">
      <h3>
        Request Log
        <button onClick={() => clearLog()}>clear</button>
      </h3>
      <div className="body">
        {entries.length === 0 && (
          <div className="muted">
            no requests yet — every API call the app makes appears here.
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="logrow" onClick={() => toggle(e.id)}>
            <div className="line">
              <span className="method">{e.method}</span>
              <span>{safePath(e.url)}</span>
              <span className={statusClass(e.status)}>{e.status ?? 'ERR'}</span>
              <span className="muted">{e.durationMs}ms</span>
              {e.requestId && (
                <span className="rid">req={e.requestId.slice(0, 8)}</span>
              )}
            </div>
            {open.has(e.id) && (
              <>
                {e.requestBody !== undefined && (
                  <pre>→ {JSON.stringify(e.requestBody, null, 2)}</pre>
                )}
                <pre>← {JSON.stringify(e.responseBody ?? e.error ?? null, null, 2)}</pre>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
