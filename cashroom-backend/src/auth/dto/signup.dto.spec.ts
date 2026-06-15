import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from './signup.dto';

/**
 * DTO-level validation tests.
 *
 * WHY HERE, not in auth.service.spec: a weak password (or bad email, or a
 * mismatch) is rejected by the global ValidationPipe BEFORE the request reaches
 * AuthService.signup. So "weak password" is a validation concern, and the honest
 * place to test it is the DTO itself — exercising the exact rules the pipe runs.
 *
 * `plainToInstance` mirrors what the ValidationPipe does (transform JSON → DTO
 * instance); `validate()` is the same function the pipe calls.
 */
describe('SignupDto validation', () => {
  const valid = {
    email: 'student@example.com',
    password: 'sup3rsecret',
    confirmPassword: 'sup3rsecret',
  };

  async function errorsFor(payload: Record<string, unknown>) {
    return validate(plainToInstance(SignupDto, payload));
  }

  it('accepts a valid payload', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
  });

  it('rejects a weak (too short) password', async () => {
    const errors = await errorsFor({
      ...valid,
      password: 'abc',
      confirmPassword: 'abc',
    });
    const passwordError = errors.find((e) => e.property === 'password');
    expect(passwordError).toBeDefined();
    expect(passwordError!.constraints).toHaveProperty('minLength');
  });

  it('rejects an invalid email format', async () => {
    const errors = await errorsFor({ ...valid, email: 'not-an-email' });
    expect(errors.find((e) => e.property === 'email')).toBeDefined();
  });

  it('rejects mismatched confirmPassword', async () => {
    const errors = await errorsFor({ ...valid, confirmPassword: 'different' });
    const confirmError = errors.find((e) => e.property === 'confirmPassword');
    expect(confirmError).toBeDefined();
    expect(confirmError!.constraints).toHaveProperty('Match');
  });
});
