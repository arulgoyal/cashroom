import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoansTable1784232494570 implements MigrationInterface {
  name = 'CreateLoansTable1784232494570';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id"                BIGSERIAL NOT NULL,
        "created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "borrower_id"       BIGINT NOT NULL,
        "status"            character varying(32) NOT NULL DEFAULT 'draft',
        "principal_paise"   BIGINT NOT NULL,
        "interest_rate_bps" integer NOT NULL,
        "tenure_months"     integer NOT NULL,
        "interest_method"   character varying(16) NOT NULL DEFAULT 'reducing',
        "purpose"           character varying(500),
        "submitted_at"      TIMESTAMP WITH TIME ZONE,
        "decided_at"        TIMESTAMP WITH TIME ZONE,
        "disbursed_at"      TIMESTAMP WITH TIME ZONE,
        "closed_at"         TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_loans" PRIMARY KEY ("id")
      )
    `);

    // Speeds up "all loans for this borrower" lookups (the common query).
    await queryRunner.query(
      `CREATE INDEX "idx_loans_borrower" ON "loans" ("borrower_id")`,
    );

    // A loan must point at a real user; RESTRICT means a user with loans cannot
    // be hard-deleted (loans must be resolved/archived first) — no orphans.
    await queryRunner.query(`
      ALTER TABLE "loans"
      ADD CONSTRAINT "fk_loans_borrower"
      FOREIGN KEY ("borrower_id") REFERENCES "users" ("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    // DB-level guard on the status vocabulary (TypeORM won't emit this for a
    // varchar+TS-enum column). Widen this set in a new migration if LoanStatus
    // gains a value.
    await queryRunner.query(`
      ALTER TABLE "loans" ADD CONSTRAINT "chk_loans_status" CHECK ("status" IN (
        'draft', 'submitted', 'under_review', 'approved', 'rejected',
        'disbursed', 'repaying', 'closed', 'defaulted'
      ))
    `);

    // Guard the interest-method vocabulary (only 'reducing' today).
    await queryRunner.query(
      `ALTER TABLE "loans" ADD CONSTRAINT "chk_loans_interest_method" CHECK ("interest_method" IN ('reducing'))`,
    );

    // Money/term sanity: a loan can't have a non-positive principal or tenure,
    // and the rate can't be negative. Cheap invariants enforced at the source.
    await queryRunner.query(
      `ALTER TABLE "loans" ADD CONSTRAINT "chk_loans_principal_positive" CHECK ("principal_paise" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" ADD CONSTRAINT "chk_loans_tenure_positive" CHECK ("tenure_months" > 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" ADD CONSTRAINT "chk_loans_rate_nonneg" CHECK ("interest_rate_bps" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order. (DROP TABLE alone would cascade these, but we mirror the
    // explicit style used elsewhere for a clear, auditable down-migration.)
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "chk_loans_rate_nonneg"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "chk_loans_tenure_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "chk_loans_principal_positive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "chk_loans_interest_method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "chk_loans_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "loans" DROP CONSTRAINT "fk_loans_borrower"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_loans_borrower"`);
    await queryRunner.query(`DROP TABLE "loans"`);
  }
}
