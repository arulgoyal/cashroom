import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { requestLogger } from './request-logger';

/** A fake Express response that can emit 'finish' and carries a status code. */
function fakeRes(statusCode: number): Response {
  const res = new EventEmitter() as unknown as Response;
  (res as unknown as { statusCode: number }).statusCode = statusCode;
  return res;
}

describe('requestLogger', () => {
  it('calls next() and logs one structured record on finish', () => {
    const emit = jest.fn();
    const req = { method: 'GET', originalUrl: '/user/me' } as Request;
    const res = fakeRes(200);
    const next = jest.fn() as unknown as NextFunction;

    requestLogger(emit)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled(); // nothing logged until the response finishes

    (res as unknown as EventEmitter).emit('finish');

    expect(emit).toHaveBeenCalledTimes(1);
    const [level, message, fields] = emit.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(level).toBe('info');
    expect(message).toBe('request');
    expect(fields.method).toBe('GET');
    expect(fields.path).toBe('/user/me');
    expect(fields.status).toBe(200);
    expect(typeof fields.durationMs).toBe('number');
    expect(fields.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it('maps status codes to log levels (4xx→warn, 5xx→error)', () => {
    const cases: [number, string][] = [
      [200, 'info'],
      [404, 'warn'],
      [429, 'warn'],
      [500, 'error'],
      [502, 'error'],
    ];

    for (const [status, expectedLevel] of cases) {
      const emit = jest.fn<void, [string, string, Record<string, unknown>]>();
      const req = { method: 'GET', originalUrl: '/x' } as Request;
      const res = fakeRes(status);
      requestLogger(emit)(req, res, () => {});
      (res as unknown as EventEmitter).emit('finish');
      expect(emit.mock.calls[0][0]).toBe(expectedLevel);
    }
  });
});
