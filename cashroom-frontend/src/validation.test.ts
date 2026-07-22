import { describe, expect, it } from 'vitest';
import { hasErrors, validateSignin, validateSignup } from './validation';

describe('validateSignup', () => {
  const ok = { email: 'a@b.com', password: 'longenough', confirmPassword: 'longenough' };

  it('accepts valid input', () => {
    expect(hasErrors(validateSignup(ok))).toBe(false);
  });
  it('rejects a bad email', () => {
    expect(validateSignup({ ...ok, email: 'nope' }).email).toMatch(/valid email/);
  });
  it('rejects a short password', () => {
    expect(
      validateSignup({ email: 'a@b.com', password: 'short', confirmPassword: 'short' })
        .password,
    ).toMatch(/at least 8/);
  });
  it('rejects a mismatch', () => {
    expect(
      validateSignup({ ...ok, confirmPassword: 'different1' }).confirmPassword,
    ).toMatch(/do not match/);
  });
});

describe('validateSignin', () => {
  it('requires email and password', () => {
    const errors = validateSignin({ email: '', password: '' });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });
  it('accepts a short password (unlike signup)', () => {
    expect(hasErrors(validateSignin({ email: 'a@b.com', password: 'x' }))).toBe(false);
  });
});
