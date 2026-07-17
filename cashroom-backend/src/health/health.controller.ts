import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * HealthController
 * ────────────────
 * Exposes GET /health. Thin by design: it only reports whether the app is up
 * and whether it can actually reach Postgres. No business logic here.
 *
 * `DataSource` is TypeORM's handle to the connection pool. We inject it instead
 * of creating one — there is exactly ONE DataSource for the whole app (set up
 * by DatabaseModule), and DI hands us that same instance.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    let db: 'connected' | 'disconnected' = 'disconnected';
    try {
      // The cheapest possible round-trip that proves the DB answers queries.
      // `SELECT 1` touches no tables — it only confirms the connection is live.
      await this.dataSource.query('SELECT 1');
      db = 'connected';
    } catch {
      db = 'disconnected';
    }

    return { status: 'ok', db };
  }
}
