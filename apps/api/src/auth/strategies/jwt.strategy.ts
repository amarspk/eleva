import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_CONFIG } from '../config/jwt.config';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../../common/types/request.types';

interface JwtTokenPayload {
  sub: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
}

interface JwtRequest {
  headers: {
    authorization?: string;
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_CONFIG.accessTokenSecret,
      passReqToCallback: true,
    });
  }

  /**
   * Decodes and validates active JWT payloads.
   * Verifies that the token has not been blacklisted via logouts.
   */
  async validate(req: JwtRequest, payload: JwtTokenPayload): Promise<AuthenticatedUser> {
    // Extract raw bearer token from request header to check blacklist
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('This access token has been revoked or blacklisted.');
      }
    }

    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
