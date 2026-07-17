import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * JwtAuthModule
 * ─────────────
 * @Global so JwtService (for signing) and JwtAuthGuard (for protecting routes)
 * are available everywhere WITHOUT creating an import cycle: AuthModule already
 * imports UserModule, so UserModule importing AuthModule back (to reach the guard)
 * would be circular. Registering once here and importing it in AppModule sidesteps
 * that — both AuthModule and UserModule get the guard/JwtService for free.
 *
 * The default secret/expiry configured here is for ACCESS tokens. Refresh tokens
 * are signed by passing per-call { secret, expiresIn } overrides to JwtService.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class JwtAuthModule {}
