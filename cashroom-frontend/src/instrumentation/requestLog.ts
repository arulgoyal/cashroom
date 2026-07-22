// A tiny in-memory pub/sub store that records every HTTP call the app makes.
// The Request Log panel subscribes to it. This is what makes the app a "glass
// box": nothing hits the network without showing up here.

export interface RequestLogEntry {
  id: number;
  method: string;
  url: string;
  pending: boolean; // true while the request is in flight (drives the live trace)
  status: number | null; // null = pending or network error (never reached the server)
  ok: boolean;
  durationMs: number;
  requestId?: string; // the X-Request-ID the BFF stamped (correlates to backend logs)
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
  at: string; // ISO timestamp (request start)
}

type Listener = (entries: RequestLogEntry[]) => void;

let entries: RequestLogEntry[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = entries;
  listeners.forEach((l) => l(snapshot));
}

export function recordRequest(entry: Omit<RequestLogEntry, 'id'>): number {
  const id = ++seq;
  entries = [{ id, ...entry }, ...entries].slice(0, 50); // newest first, keep 50
  emit();
  return id;
}

/** Patch an in-flight entry once the response (or error) arrives. */
export function updateRequest(id: number, patch: Partial<RequestLogEntry>): void {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
}

export function getEntries(): RequestLogEntry[] {
  return entries;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearLog(): void {
  entries = [];
  emit();
}
