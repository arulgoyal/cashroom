import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchJson } from './client';
import { clearLog, getEntries } from '../instrumentation/requestLog';

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('fetchJson', () => {
  beforeEach(() => {
    clearLog();
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on 2xx and records the call (with requestId)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(200, { id: '1' }, { 'X-Request-ID': 'rid-1' }),
      ),
    );

    const data = await fetchJson<{ id: string }>('/x');
    expect(data.id).toBe('1');

    const entry = getEntries()[0];
    expect(entry.status).toBe(200);
    expect(entry.requestId).toBe('rid-1');
    expect(entry.ok).toBe(true);
  });

  it('throws a typed ApiError (status + message + requestId) on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(
          409,
          { statusCode: 409, message: 'email already exists', requestId: 'rid-2' },
          { 'X-Request-ID': 'rid-2' },
        ),
      ),
    );

    await expect(fetchJson('/x', { method: 'POST', body: {} })).rejects.toMatchObject(
      { name: 'ApiError', status: 409, message: 'email already exists', requestId: 'rid-2' },
    );
  });

  it('joins an array validation message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(400, { statusCode: 400, message: ['a must be x', 'b required'] }),
      ),
    );
    const err = await fetchJson('/x', { method: 'POST', body: {} }).catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('a must be x; b required');
  });
});
