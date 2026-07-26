import { Module, OnModuleInit } from '@nestjs/common';
import { SecretsManagerService } from './secrets-manager.service';

/**
 * Global module that loads secrets from AWS Secrets Manager (or falls back to env vars)
 * before any other module initializes.
 *
 * Usage in main.ts:
 *   await secretsManagerService.loadSecrets();
 *   const app = await NestFactory.create(AppModule);
 *
 * Or via OnModuleInit lifecycle hook:
 *   The service automatically loads secrets when the module initializes.
 */
@Module({
  providers: [SecretsManagerService],
  exports: [SecretsManagerService],
})
export class SecretsManagerModule implements OnModuleInit {
  constructor(private readonly secretsService: SecretsManagerService) {}

  async onModuleInit(): Promise<void> {
    await this.secretsService.loadSecrets();
  }
}
