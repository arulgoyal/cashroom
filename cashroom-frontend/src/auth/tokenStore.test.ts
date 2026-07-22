import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTokens,
  decodeJwt,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokenStore';

function base64Url(obj: unknown): string {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function makeJwt(header: unknown, payload: unknown): string {
  return `${base64Url(header)}.${base64Url(payload)}.sig`;
}

describe('tokenStore', () => {
  beforeEach(() => clearTokens());

  it('sets and gets both tokens', () => {
    setTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(getAccessToken()).toBe('a');
    expect(getRefreshToken()).toBe('r');
  });

  it('clears tokens', () => {
    setTokens({ accessToken: 'a', refreshToken: 'r' });
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('decodeJwt', () => {
  it('decodes the header and payload claims', () => {
    const token = makeJwt(
      { alg: 'HS256', typ: 'JWT' },
      { sub: '1', email: 'a@b.com', role: 'student', exp: 123 },
    );
    const decoded = decodeJwt(token);
    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload.sub).toBe('1');
    expect(decoded?.payload.email).toBe('a@b.com');
    expect(decoded?.payload.exp).toBe(123);
  });

  it('returns null for a non-JWT string', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
  });
});
