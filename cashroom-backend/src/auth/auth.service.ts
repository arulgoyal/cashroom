import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions, TokenExpiredError } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { UserService } from '../user/user.service';
import {
  EMAIL_JOB_OPTS,
  EMAIL_QUEUE,
  SEND_VERIFICATION_EMAIL,
} from '../queue/queue.constants';
import { SendVerificationEmailJob } from '../queue/email-job.interface';
import { User } from '../user/entities/user.entity';
import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';
import { RefreshDto } from './dto/refresh.dto';
import { EmailAlreadyExistsException } from './exceptions/email-already-exists.exception';
import {
  JwtPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

/** The user, minus the secret hash columns — what we are ever willing to return. */
export type SafeUser = Omit<User, 'passwordHash' | 'refreshTokenHash'>;

/** Token pair returned by signin / refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * A fixed, valid bcrypt hash compared against when the email is unknown. bcrypt
 * still does the (slow) work, so an attacker can't distinguish "no such user"
 * from "wrong password" by timing → no user enumeration. The plaintext never
 * matches it, so the compare always returns false.
 */
const DUMMY_HASH =
  '$2b$12$vq8iqDdT29xrbaCU.sHRdecRs7WfLdAa37lQr66Na4PNq2oHDUtla';

/** Same generic message whether the email is unknown or the password is wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: JwtSignOptions['expiresIn'];
  private readonly verificationSecret: string;
  private readonly verificationExpiresIn: JwtSignOptions['expiresIn'];

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue<SendVerificationEmailJob>,
  ) {
    this.bcryptRounds = Number(config.get<string>('BCRYPT_ROUNDS') ?? 12);
    this.refreshSecret =
      config.get<string>('JWT_REFRESH_SECRET') ?? 'change_me_refresh';
    this.refreshExpiresIn = (config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as JwtSignOptions['expiresIn'];
    this.verificationSecret =
      config.get<string>('EMAIL_VERIFICATION_SECRET') ?? 'change_me_verify';
    this.verificationExpiresIn = (config.get<string>(
      'EMAIL_VERIFICATION_EXPIRES_IN',
    ) ?? '24h') as JwtSignOptions['expiresIn'];
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

    // Fire off the verification email asynchronously. Deliberately AFTER the user
    // is committed, and non-fatal (see enqueue method) — creating the account must
    // not depend on a working queue/email path.
    await this.enqueueVerificationEmail(user);

    return this.toSafeUser(user);
  }

  /**
   * Enqueue a `send-verification-email` job. The verification token is a
   * short-lived JWT (sub=userId) signed with a DEDICATED secret (never the
   * access-token secret) — the future /auth/verify endpoint will verify it.
   *
   * Enqueue failure is caught, not thrown: the account already exists, so a Redis
   * hiccup must not turn a successful signup into a 500. (This is NOT atomic with
   * the user insert — the transactional-outbox pattern is the production fix; see
   * the learning note.)
   */
  private async enqueueVerificationEmail(user: User): Promise<void> {
    try {
      const verificationToken = await this.jwt.signAsync(
        { sub: user.id },
        {
          secret: this.verificationSecret,
          expiresIn: this.verificationExpiresIn,
        },
      );

      await this.emailQueue.add(
        SEND_VERIFICATION_EMAIL,
        { userId: user.id, email: user.email, verificationToken },
        EMAIL_JOB_OPTS,
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue verification email for user ${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Verify credentials and issue a token pair. Uses the same generic error and a
   * dummy hash compare for the unknown-email case, so neither the message nor the
   * response time reveals whether an email is registered.
   */
  async signin(dto: SigninDto): Promise<TokenPair> {
    const user = await this.users.findByEmailWithPassword(dto.email);

    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH); // equalize timing
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueTokens(user);
  }

  /**
   * Exchange a valid refresh token for a NEW token pair (rotation). The DB hash is
   * the source of truth for revocation: even a correctly-signed, unexpired refresh
   * token is rejected if its hash no longer matches the stored one (i.e. it was
   * already rotated, or the user signed in elsewhere).
   */
  async refresh(dto: RefreshDto): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        dto.refreshToken,
        { secret: this.refreshSecret },
      );
    } catch (err) {
      const message =
        err instanceof TokenExpiredError
          ? 'Refresh token expired'
          : 'Invalid refresh token';
      throw new UnauthorizedException(message);
    }

    const user = await this.users.findByIdWithRefreshHash(payload.sub);
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const presentedHash = this.hashToken(dto.refreshToken);
    if (presentedHash !== user.refreshTokenHash) {
      // Correctly signed but not the current token → rotated/revoked/stolen.
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  /** Sign a fresh access+refresh pair and persist the new refresh token's hash. */
  private async issueTokens(user: User): Promise<TokenPair> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    // Access token uses the module-default secret/expiry (JWT_SECRET / 15m).
    const accessToken = await this.jwt.signAsync(accessPayload);

    // Refresh token: separate secret + longer expiry. The jti makes every issued
    // token unique, so rotation always produces a genuinely new token + hash.
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti: randomUUID(),
    };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    // Store only the HASH — a DB leak can't be replayed. Overwriting it here is
    // both the "remember this session" step and the rotation/single-session rule.
    await this.users.updateRefreshTokenHash(
      user.id,
      this.hashToken(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  /**
   * sha256 of a token. Fast hash is fine here (unlike passwords) because a JWT is
   * high-entropy — there's nothing to brute-force. Still hashed so the raw token
   * is never stored.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Strip secret hashes so they can never leave the service in a response. */
  private toSafeUser(user: User): SafeUser {
    const { passwordHash: _pw, refreshTokenHash: _rt, ...safe } = user;
    void _pw;
    void _rt;
    return safe;
  }
}
