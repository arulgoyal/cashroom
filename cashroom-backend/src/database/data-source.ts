import { config } from 'dotenv';
import { DataSource } from 'typeorm';

/**
 * Standalone DataSource for the TypeORM CLI (migration:generate / run / revert).
 * ─────────────────────────────────────────────────────────────────────────────
 * The app's runtime connection is configured in DatabaseModule via Nest DI
 * (`forRootAsync`). But the CLI runs OUTSIDE Nest — there is no DI at the command
 * line — so it needs its own DataSource that reads the same `DATABASE_*` env vars
 * and points at the entity + migration globs.
 *
 * Keep this in sync with database.module.ts (host/port/credentials, synchronize).
 */
config(); // load .env into process.env (CLI has no Nest ConfigModule)

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,

  // Glob the compiled-by-ts-node entities/migrations. Using .ts here because we
  // run the CLI through `typeorm-ts-node-commonjs` (no build step).
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],

  // Never auto-sync; migrations are the only way schema changes.
  synchronize: false,
  logging: true,
});
