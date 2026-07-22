// Pure client-side validators. WHY validate on the client at all if the server
// already does? Speed + UX: catch obvious mistakes (bad email, short password,
// mismatch) instantly, with no round trip. But the CLIENT IS ATTACKER-CONTROLLED
// — anyone can bypass this with curl — so the SERVER validation (class-validator
// DTOs) is the real security boundary. Client = convenience; server = trust.

export interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

// Deliberately simple — mirrors the intent of the backend's @IsEmail, not a full
// RFC 5322 parser (that's the server's job to enforce authoritatively).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(input: {
  email: string;
  password: string;
  confirmPassword: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.email) errors.email = 'email is required';
  else if (!EMAIL_RE.test(input.email))
    errors.email = 'must be a valid email address';

  if (!input.password) errors.password = 'password is required';
  else if (input.password.length < 8)
    errors.password = 'password must be at least 8 characters';
  else if (input.password.length > 72)
    errors.password = 'password must be at most 72 characters';

  if (input.confirmPassword !== input.password)
    errors.confirmPassword = 'passwords do not match';

  return errors;
}

export function validateSignin(input: {
  email: string;
  password: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.email) errors.email = 'email is required';
  else if (!EMAIL_RE.test(input.email))
    errors.email = 'must be a valid email address';
  if (!input.password) errors.password = 'password is required';
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
