import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { UserRole } from '../enums/user-role.enum';

/**
 * User
 * ────
 * A Cashroom account. Maps to the `users` table. Inherits `id`, `createdAt`,
 * and `updatedAt` from BaseEntity.
 *
 * No auth logic here — this is the data shape only. Password hashing, login,
 * and RBAC guards come in a later step.
 */
@Entity('users')
export class User extends BaseEntity {
  /**
   * Login identifier and primary contact. Unique so two accounts can't share
   * an address; the unique index also speeds up the by-email login lookup.
   * Normalize to lowercase at the service layer before persisting.
   */
  @Index('uq_users_email', { unique: true })
  @Column({ name: 'email', type: 'varchar', length: 255 })
  email: string;

  /**
   * One-way hash of the password — NEVER the plaintext. The name encodes that
   * invariant. `select: false` keeps it out of default queries so it can't leak
   * into API responses unless a query explicitly asks for it.
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  /**
   * Single role per user. Stored as its string value; the allowed set is
   * enforced both by this TS enum and a DB CHECK constraint (added in the
   * migration). Defaults to STUDENT.
   */
  @Column({
    name: 'role',
    type: 'varchar',
    length: 32,
    default: UserRole.STUDENT,
  })
  role: UserRole;

  /** Gates actions until the user proves ownership of the email address. */
  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified: boolean;
}
