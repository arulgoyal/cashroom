import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule
 * ────────────
 * Groups the health-check endpoint. It has a controller but no service —
 * the logic is trivial and depends only on the DataSource, which the global
 * TypeORM setup already provides. No providers needed.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
