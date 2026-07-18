import type { Request, Response } from 'express';
import { requestContext } from './request-context.middleware';
import { getContext } from './logging.als';

describe('backend requestContext middleware', () => {
  it('HONORS an inbound X-Request-ID (from the BFF) and echoes it', () => {
    const req = {
      headers: { 'x-request-id': 'from-bff' },
    } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    let seen: string | undefined;
    requestContext()(req, res, () => {
      seen = getContext()?.requestId;
    });

    expect(seen).toBe('from-bff');
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'from-bff');
  });

  it('generates a UUID when no header is present', () => {
    const req = { headers: {} } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    let seen: string | undefined;
    requestContext()(req, res, () => {
      seen = getContext()?.requestId;
    });

    expect(seen).toHaveLength(36); // uuid v4
  });
});
