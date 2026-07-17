import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BffAuthGuard, AccessTokenPayload } from './bff-auth.guard';

/** Build a fake ExecutionContext wrapping a minimal request. */
interface FakeReq {
  path: string;
  headers: Record<string, string | undefined>;
  user?: AccessTokenPayload;
}
function contextFor(req: FakeReq): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('BffAuthGuard', () => {
  let verify: jest.Mock;
  let guard: BffAuthGuard;

  beforeEach(() => {
    verify = jest.fn();
    const jwt = { verify } as unknown as JwtService;
    const config = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    guard = new BffAuthGuard(jwt, config);
  });

  it('lets public paths through without a token', () => {
    const req: FakeReq = { path: '/auth/signin', headers: {} };
    expect(guard.canActivate(contextFor(req))).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('protected path, no Authorization header → 401 Missing bearer token', () => {
    const req: FakeReq = { path: '/user/me', headers: {} };
    expect(() => guard.canActivate(contextFor(req))).toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('protected path, malformed header → 401 Invalid token', () => {
    const req: FakeReq = {
      path: '/user/me',
      headers: { authorization: 'Token abc' },
    };
    expect(() => guard.canActivate(contextFor(req))).toThrow('Invalid token');
  });

  it('protected path, valid token → true and attaches req.user', () => {
    const payload: AccessTokenPayload = {
      sub: '1',
      email: 's@x.com',
      role: 'student',
    };
    verify.mockReturnValue(payload);
    const req: FakeReq = {
      path: '/user/me',
      headers: { authorization: 'Bearer good.token.here' },
    };

    expect(guard.canActivate(contextFor(req))).toBe(true);
    expect(req.user).toEqual(payload);
    expect(verify).toHaveBeenCalledWith('good.token.here', {
      secret: 'test-secret',
    });
  });

  it('expired token → 401 Token expired', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    verify.mockImplementation(() => {
      throw err;
    });
    const req: FakeReq = {
      path: '/user/me',
      headers: { authorization: 'Bearer expired.token' },
    };
    expect(() => guard.canActivate(contextFor(req))).toThrow('Token expired');
  });

  it('invalid signature → 401 Invalid token', () => {
    verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const req: FakeReq = {
      path: '/user/me',
      headers: { authorization: 'Bearer forged.token' },
    };
    expect(() => guard.canActivate(contextFor(req))).toThrow('Invalid token');
  });
});
