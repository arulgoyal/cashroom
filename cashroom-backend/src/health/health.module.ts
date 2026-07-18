import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisHealthService } from './redis-health.service';

/**
 * HealthModule
 * ────────────
 * The health controller now depends on a dedicated Redis client (for the readiness
 * ping) in addition to the DataSource, so RedisHealthService is provided here.
 */
@Module({
  controllers: [HealthController],
  providers: [RedisHealthService],
})
export class HealthModule {}
