import { Controller, Get, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { RedisHealthService } from './redis-health.service';

/**
 * HealthController
 * ────────────────
 * Two probes, matching the Kubernetes distinction:
 *
 *   GET /livez  — LIVENESS: "is the process alive?" No dependency checks. If this
 *                 fails, an orchestrator RESTARTS the pod. A DB/Redis outage must
 *                 NOT fail liveness (restarting won't fix a downstream outage).
 *
 *   GET /health — READINESS: "can it serve traffic right now?" Checks Postgres +
 *                 Redis. If a dependency is down it returns 503 so the orchestrator
 *                 stops routing traffic here (without restarting). We set the
 *                 status via @Res so a 503 does NOT throw (which would hit the
 *                 exception filter and be reported to Sentry as an error).
 */
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisHealthService,
  ) {}

  @Get('livez')
  livez() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const [dbOk, redisOk] = await Promise.all([
      this.checkDb(),
      this.redis.ping(),
    ]);
    const ok = dbOk && redisOk;

    res.status(ok ? 200 : 503);
    return {
      status: ok ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
