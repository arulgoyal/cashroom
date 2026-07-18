import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { EmailAlreadyExistsException } from '../auth/exceptions/email-already-exists.exception';

/** Postgres error code for a unique-constraint violation. */
const PG_UNIQUE_VIOLATION = '23505';

/** The data UserService needs to persist a new user. */
export interface CreateUserData {
  email: string;
  passwordHash: string;
  role?: UserRole;
}

/**
 * UserService
 * ───────────
 * Single owner of reads/writes to the `users` table. AuthService (and future
 * features) go through here rather than touching the repository directly, so the
 * persistence rules for users live in exactly one place.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Lookup by email. Emails are stored lowercased, so we normalise here too. */
  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  /**
   * Like findByEmail, but explicitly pulls in `passwordHash` (which is
   * `select:false`, so the default query omits it). Used ONLY by signin, where we
   * must compare against the hash. Keeping it a separate method means the hash is
   * never loaded accidentally elsewhere.
   */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  /** Lookup by primary key (e.g. resolving a JWT `sub` to the current user). */
  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Like findById, but includes the `select:false` refresh_token_hash. */
  findByIdWithRefreshHash(id: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  /** Persist (or clear, with null) the hash of a user's current refresh token. */
  async updateRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.users.update({ id }, { refreshTokenHash });
  }

  /**
   * Insert a new user. Email is lowercased for a stable unique key.
   *
   * The unique index `uq_users_email` is the *real* duplicate guarantee (a prior
   * findByEmail check is best-effort and racy). If two requests slip past that
   * check concurrently, the second INSERT trips the unique constraint — we catch
   * it and surface the same 409 the caller expects.
   */
  async create(data: CreateUserData): Promise<User> {
    const user = this.users.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      role: data.role ?? UserRole.STUDENT,
    });

    try {
      return await this.users.save(user);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new EmailAlreadyExistsException();
      }
      throw err;
    }
  }
}
