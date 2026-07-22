import { recordRequest, updateRequest } from '../instrumentation/requestLog';
import { getAccessToken } from '../auth/tokenStore';
import type { ApiErrorBody } from './types';

/**
 * The ONE way the app makes HTTP calls. Every call is recorded into the Request
 * Log (glass box) and every non-2xx becomes a typed ApiError carrying the BFF's
 * requestId, so pages can render the exact error envelope.
 */
const BFF_URL: string = import.meta.env.VITE_BFF_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly body?: ApiErrorBody;

  // Explicit field assignment (not TS parameter-properties) because the Vite
  // template enables `erasableSyntaxOnly` — no TS syntax that emits runtime code.
  constructor(
    status: number,
    message: string,
    requestId?: string,
    body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach Authorization: Bearer <access token>
}

export async function fetchJson<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false } = opts;
  const url = `${BFF_URL}${path}`;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  // Record the call as PENDING first, so the Trace panel can animate it live,
  // then patch it once the response/error arrives.
  const traceId = recordRequest({
    method,
    url,
    pending: true,
    status: null,
    ok: false,
    durationMs: 0,
    requestBody: body,
    at: new Date().toISOString(),
  });

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Network-level failure — the request never reached the server.
    const durationMs = Math.round(performance.now() - start);
    const message = e instanceof Error ? e.message : String(e);
    updateRequest(traceId, {
      pending: false,
      status: null,
      ok: false,
      durationMs,
      error: message,
    });
    throw new ApiError(0, `Network error: ${message}`);
  }

  const durationMs = Math.round(performance.now() - start);
  const requestId = res.headers.get('X-Request-ID') ?? undefined;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  updateRequest(traceId, {
    pending: false,
    status: res.status,
    ok: res.ok,
    durationMs,
    requestId,
    responseBody: parsed,
  });

  if (!res.ok) {
    const errBody = parsed as ApiErrorBody | undefined;
    const message = Array.isArray(errBody?.message)
      ? errBody.message.join('; ')
      : (errBody?.message ?? `HTTP ${res.status}`);
    throw new ApiError(res.status, message, requestId ?? errBody?.requestId, errBody);
  }

  return parsed as T;
}

export { BFF_URL };
