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

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: JWT_CONFIG.accessTokenSecret,
      signOptions: { expiresIn: JWT_CONFIG.accessTokenExpiry },
    }),
    RateLimitModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, CaslAbilityFactory, RbacPermissionGuard],
  exports: [AuthService, PassportModule, JwtModule, CaslAbilityFactory, RbacPermissionGuard],
})
export class AuthModule {}
