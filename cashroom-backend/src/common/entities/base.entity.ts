import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * BaseEntity
 * ──────────
 * Shared columns every table in Cashroom carries: a primary key and audit
 * timestamps. Entities (User, and later Loan, etc.) `extends BaseEntity` so the
 * mapping lives in one place and stays consistent across tables.
 *
 * `abstract` means this class is never an `@Entity()` of its own — it has no
 * table. TypeORM copies its decorated columns down into each concrete entity.
 */
export abstract class BaseEntity {
  /**
   * bigint, DB-generated, auto-incrementing primary key.
   *
   * Typed `string` (not `number`) on purpose: a bigint can exceed JS's safe
   * integer range (2^53), so TypeORM returns it as a string to avoid silent
   * precision loss. Same reasoning the project applies to money columns.
   */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** Set once, on insert. */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** Auto-bumped by TypeORM on every save. */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
