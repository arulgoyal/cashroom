import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

    // @Global: makes JwtService (signing) + JwtAuthGuard available everywhere,
    // avoiding an Auth↔User import cycle.
    JwtAuthModule,

    // Feature modules.
    HealthModule,
    AuthModule,
    UserModule,
    LoanModule,
  ],
})
export class AppModule {}
