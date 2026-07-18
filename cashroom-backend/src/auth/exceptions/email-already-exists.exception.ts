import { ConflictException } from '@nestjs/common';

/**
 * EmailAlreadyExistsException
 * ───────────────────────────
 * Thrown when a signup targets an email that already has an account.
 *
 * Extends Nest's `ConflictException`, so it automatically maps to HTTP **409**:
 * the request was well-formed and valid (that would be 400), but it conflicts
 * with current server state — the email is taken. A named class (vs throwing
 * ConflictException inline) makes the intent explicit, greppable, reusable, and
 * lets unit tests assert on the exact type.
 */
export class EmailAlreadyExistsException extends ConflictException {
  constructor() {
    super('An account with this email already exists.');
  }
}
