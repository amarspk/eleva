import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { CacheModule } from '../cache/cache.module';
import { JWT_CONFIG } from '../../auth/config/jwt.config';

/**
 * DEFECT-I: `CsrfGuard` now verifies the bearer token itself rather than
 * trusting `request.user` (which is always undefined for a global guard), so
 * it needs `JwtService`. Registered locally with the same access-token secret
 * used by `AuthModule`/`JwtStrategy`; importing `AuthModule` here would create
 * a circular dependency (AuthModule -> ... -> CsrfModule).
 */
@Global()
@Module({
  imports: [
    CacheModule,
    JwtModule.register({
      secret: JWT_CONFIG.accessTokenSecret,
      signOptions: { expiresIn: JWT_CONFIG.accessTokenExpiry },
    }),
  ],
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}
