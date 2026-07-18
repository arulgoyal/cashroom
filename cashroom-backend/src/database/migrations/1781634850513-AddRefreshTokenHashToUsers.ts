import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenHashToUsers1781634850513 implements MigrationInterface {
  name = 'AddRefreshTokenHashToUsers1781634850513';

  // NOTE: TypeORM's generator also tried to DROP the hand-added `chk_users_role`
  // CHECK constraint (it isn't represented in entity metadata, so the differ
  // thinks it's stray). That was removed by hand — this migration ONLY adds the
  // nullable refresh_token_hash column and leaves the role CHECK intact.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "refresh_token_hash" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`,
    );
  }
}
