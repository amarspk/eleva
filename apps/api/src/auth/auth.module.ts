import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JWT_CONFIG } from './config/jwt.config';
import { CaslAbilityFactory } from './casl-ability.factory';
import { RbacPermissionGuard } from './guards/rbac-permission.guard';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { NotificationModule } from '../notification/notification.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_CONFIG.accessTokenSecret,
      signOptions: { expiresIn: JWT_CONFIG.accessTokenExpiry },
    }),
    RateLimitModule,
    // AUDIT-005: EmailService (exported by NotificationModule) powers the
    // password-reset and email-verification dispatches (TenantModule pattern).
    // forwardRef resolves the module cycle AuthModule -> NotificationModule
    // -> KdsModule -> AuthModule, which this new edge closed (latent before):
    // the reference is deferred until every module class is fully evaluated.
    forwardRef(() => NotificationModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, CaslAbilityFactory, RbacPermissionGuard],
  exports: [AuthService, PassportModule, JwtModule, CaslAbilityFactory, RbacPermissionGuard],
})
export class AuthModule {}
