import type { Request, Response } from 'express';
import { requestContext } from './request-context.middleware';
import { getContext } from './logging.als';

describe('BFF requestContext middleware', () => {
  it('MINTS a fresh id, ignoring any client-supplied X-Request-ID (trust edge)', () => {
    const req = {
      headers: { 'x-request-id': 'client-supplied' },
    } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    let seen: string | undefined;
    requestContext()(req, res, () => {
      seen = getContext()?.requestId;
    });

    expect(seen).not.toBe('client-supplied');
    expect(seen).toHaveLength(36); // fresh uuid
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', seen);
  });
});
