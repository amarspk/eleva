import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Staff user management (AUDIT-004).
 *
 * `AuthModule` is imported for two reasons: it exports `AuthService` (Argon2id
 * hashing — the same primitive the login path verifies against, so credentials
 * created here work with the existing authentication flow unchanged) and it
 * provides the `RbacPermissionGuard`/`CaslAbilityFactory` used by the
 * controller.
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
