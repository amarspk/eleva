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

  // DOC-009 §8.2: Body parser with raw body capture for Stripe webhook signature verification.
  // The verify callback stores the raw Buffer on req.rawBody BEFORE Express mutates req.body,
  // ensuring the HMAC signature check uses the exact bytes Stripe signed.
  app.use(require('express').json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      if (req.method === 'POST' && req.path === '/api/v1/billing/webhooks') {
        req.rawBody = Buffer.from(buf);
      }
    },
  }));

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
