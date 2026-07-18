import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * A tiny, dedicated ioredis client used ONLY for the health ping — kept separate
 * from BullMQ's internal connection so a health check never interferes with job
 * processing. `enableOfflineQueue:false` makes `ping()` fail fast (rather than
 * hang) when Redis is down, which is exactly what a health check wants.
 */
@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    const password = config.get<string>('REDIS_PASSWORD');
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: password && password.length > 0 ? password : undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    // Swallow connection errors — the health endpoint reports status; an
    // unhandled 'error' event would otherwise crash the process.
    this.client.on('error', () => undefined);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // ignore
    }
  }
}
