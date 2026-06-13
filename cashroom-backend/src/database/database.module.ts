import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * DatabaseModule
 * ──────────────
 * One job: own the single, app-wide connection to PostgreSQL.
 *
 * We use `forRootAsync` (not `forRoot`) so the connection config can be built
 * from injected dependencies — here, ConfigService, which reads our `.env`.
 * `forRoot` would force us to hard-code values or reach for `process.env`
 * directly; `forRootAsync` keeps config flowing through DI like everything else.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // ConfigModule is global, but importing it here documents the dependency.
      imports: [ConfigModule],
      inject: [ConfigService],
      // The factory runs at startup; whatever it returns is the connection config.
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        username: config.get<string>('DATABASE_USER'),
        password: config.get<string>('DATABASE_PASSWORD'),
        database: config.get<string>('DATABASE_NAME'),

        // Auto-load any class decorated with @Entity() that a feature module
        // registers via TypeOrmModule.forFeature([...]). No manual entity list.
        autoLoadEntities: true,

        // synchronize:true would auto-create/alter tables from entities on every
        // boot. Convenient, but it can DROP columns and lose data — unacceptable
        // for a lending ledger. We keep it OFF and will use explicit migrations.
        synchronize: false,

        // Log SQL only outside production, so we can see what TypeORM emits.
        logging: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}
