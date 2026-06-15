import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';

/** The user, minus the password hash — what we are ever willing to return. */
export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthService {
  private readonly bcryptRounds: number;

  constructor(
    private readonly users: UserService,
    config: ConfigService,
  ) {
    // Cost factor flows through config so it can be tuned per environment.
    this.bcryptRounds = Number(config.get<string>('BCRYPT_ROUNDS') ?? 12);
  }

  /**
   * Create a new account. The DTO is already validated by the global
   * ValidationPipe (valid email, password length, passwords match) before we get
   * here, so this method only handles state-dependent rules.
   */
  async signup(dto: SignupDto): Promise<SafeUser> {
    const email = dto.email.toLowerCase();

    // Duplicate check FIRST — before the expensive hash. bcrypt is deliberately
    // slow; don't burn ~100ms of CPU on a request we already know will fail (and
    // don't hand attackers a cheap way to make us do expensive work).
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyExistsException();
    }

    // Hash only once we know we'll use it. bcrypt generates a per-password salt
    // and embeds it in the output ($2b$<rounds>$<salt><hash>).
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    // create() also catches the unique-index violation → same 409 under a race.
    const user = await this.users.create({ email, passwordHash });

    return this.toSafeUser(user);
  }

  /** Strip the hash so it can never leave the service in a response. */
  private toSafeUser(user: User): SafeUser {
    const { passwordHash: _omit, ...safe } = user;
    void _omit;
    return safe;
  }
}
