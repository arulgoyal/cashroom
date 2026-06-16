import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard, AuthedRequest } from './jwt-auth.guard';
import { UserRole } from '../../user/enums/user-role.enum';

/**
 * JwtAuthGuard unit tests — verifies the three failure modes the client cares
 * about (missing / invalid / expired) all become 401 with distinct messages, and
 * that a valid token populates req.user.
 */
describe('JwtAuthGuard', () => {
  const SECRET = 'test-access-secret';
  const jwt = new JwtService({ secret: SECRET });
  const config = { get: () => SECRET } as unknown as ConfigService;
  const guard = new JwtAuthGuard(jwt, config);

  /** Build a fake ExecutionContext wrapping a request with the given auth header. */
  const contextWith = (authorization?: string): ExecutionContext => {
    const req = {
      headers: authorization ? { authorization } : {},
    } as AuthedRequest;
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  const validToken = () =>
    jwt.sign({ sub: '1', email: 'a@b.com', role: UserRole.STUDENT });

  it('valid token: returns true and attaches req.user', async () => {
    const req = {
      headers: { authorization: `Bearer ${validToken()}` },
    } as AuthedRequest;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user.sub).toBe('1');
    expect(req.user.role).toBe(UserRole.STUDENT);
  });

  it('missing token: 401 "Missing bearer token"', async () => {
    await expect(guard.canActivate(contextWith())).rejects.toThrow(
      new UnauthorizedException('Missing bearer token'),
    );
  });

  it('non-Bearer scheme: treated as missing', async () => {
    await expect(
      guard.canActivate(contextWith('Basic abc123')),
    ).rejects.toThrow(new UnauthorizedException('Missing bearer token'));
  });

  it('invalid token (bad signature): 401 "Invalid token"', async () => {
    const forged = new JwtService({ secret: 'other-secret' }).sign({
      sub: '1',
    });
    await expect(
      guard.canActivate(contextWith(`Bearer ${forged}`)),
    ).rejects.toThrow(new UnauthorizedException('Invalid token'));
  });

  it('expired token: 401 "Token expired"', async () => {
    const expired = jwt.sign({ sub: '1' }, { expiresIn: '-1s' });
    await expect(
      guard.canActivate(contextWith(`Bearer ${expired}`)),
    ).rejects.toThrow(new UnauthorizedException('Token expired'));
  });
});
