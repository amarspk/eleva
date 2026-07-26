import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SecretsManagerService } from './common/secrets/secrets-manager.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting Zayjar platform API bootstrap sequence...');

  // DOC-006 §5.9: Load secrets from AWS Secrets Manager before module initialization.
  // Falls back to existing environment variables when AWS Secrets Manager is not configured.
  const secretsService = new SecretsManagerService();
  await secretsService.loadSecrets();

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  app.enableShutdownHooks();

  const port = process.env.PORT || 8000;
  await app.listen(port);

  logger.log(`Zayjar API running on port ${port}`);
}

bootstrap();
