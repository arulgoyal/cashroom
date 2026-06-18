import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SigninDto } from './signin.dto';

/**
 * SigninDto validation — same plainToInstance + validate() approach the global
 * ValidationPipe uses. Deliberately lighter than SignupDto: shape only, no
 * password-policy enforcement (that's signup's job).
 */
describe('SigninDto validation', () => {
  const valid = { email: 'student@example.com', password: 'whatever' };

  const errorsFor = (payload: Record<string, unknown>) =>
    validate(plainToInstance(SigninDto, payload));

  it('accepts a valid payload', async () => {
    expect(await errorsFor(valid)).toHaveLength(0);
  });

  it('rejects an invalid email format', async () => {
    const errors = await errorsFor({ ...valid, email: 'not-an-email' });
    expect(errors.find((e) => e.property === 'email')).toBeDefined();
  });

  it('rejects an empty password', async () => {
    const errors = await errorsFor({ ...valid, password: '' });
    expect(errors.find((e) => e.property === 'password')).toBeDefined();
  });
});
