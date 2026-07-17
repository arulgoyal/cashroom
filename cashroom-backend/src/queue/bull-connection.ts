import { ConfigService } from '@nestjs/config';

/**
 * Builds the BullMQ shared connection config from env. Used by BOTH the API
 * (`BullModule.forRootAsync` in AppModule) and the worker
 * (`WorkerModule`) so producer and consumer point at the same Redis.
 *
 * Host dev → REDIS_HOST=localhost; in compose → REDIS_HOST=redis (service name).
 * An empty password is coerced to `undefined` (no AUTH) rather than "".
 */
export function bullConnectionFactory(config: ConfigService) {
  const password = config.get<string>('REDIS_PASSWORD');
  return {
    connection: {
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: password && password.length > 0 ? password : undefined,
    },
  };
}
