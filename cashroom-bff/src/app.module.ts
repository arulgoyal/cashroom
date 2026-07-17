import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ProxyController } from './proxy/proxy.controller';
import { BffAuthGuard } from './auth/bff-auth.guard';

/**
 * AppModule (BFF root).
 * Wires the three edge concerns + the proxy. Global guards run in the order they
 * are registered below: throttle FIRST (reject floods before doing crypto),
 * then JWT verification.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // JwtService for verifying access tokens. Same secret the backend signs with.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),

    // Per-IP rate limiting. ttl is in MILLISECONDS in throttler v5+, so we read
    // seconds from env and convert. limit = requests allowed per ttl window.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL') ?? 60) * 1000,
            limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
          },
        ],
      }),
    }),
  ],
  controllers: [ProxyController],
  providers: [
    // 1) rate limit  2) verify JWT — order matters, throttle before auth work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: BffAuthGuard },
  ],
})
export class AppModule {}
