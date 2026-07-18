import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { bullConnectionFactory } from './queue/bull-connection';
import { EMAIL_DLQ } from './queue/queue.constants';
import { UserContextInterceptor } from './observability/user-context.interceptor';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { JwtAuthModule } from './auth/jwt-auth.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { LoanModule } from './loan/loan.module';

/**
 * AppModule — the ROOT module.
 * ────────────────────────────
 * NestFactory.create(AppModule) in main.ts starts here. Nest reads this
 * module's `imports`, then each of THEIR imports, and so on — building one
 * dependency-injection tree for the whole app. Nothing exists outside it.
 */
@Module({
  imports: [
    // Loads `.env` and makes ConfigService injectable everywhere.
    // isGlobal:true = no need to re-import ConfigModule in every module.
    ConfigModule.forRoot({ isGlobal: true }),

    // Infrastructure: establishes the one Postgres connection.
    DatabaseModule,

    // Root BullMQ connection to Redis (shared by all registered queues). Feature
    // modules add specific queues with BullModule.registerQueue(...).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullConnectionFactory,
    }),

    // Register the DLQ here so the API has a handle for the Bull Board dashboard
    // (the `email` queue is registered in AuthModule for the producer).
    BullModule.registerQueue({ name: EMAIL_DLQ }),

    // @Global: makes JwtService (signing) + JwtAuthGuard available everywhere,
    // avoiding an Auth↔User import cycle.
    JwtAuthModule,

    // Feature modules.
    HealthModule,
    AuthModule,
    UserModule,
    LoanModule,
  ],
  providers: [
    // Runs after guards → writes the authenticated userId into the request's ALS
    // context, so every log line after auth also carries it.
    { provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
  ],
})
export class AppModule {}
