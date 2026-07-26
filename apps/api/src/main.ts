import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SecretsManagerService } from './common/secrets/secrets-manager.service';
import { ZayjarLogger, getGlobalLogger } from './common/logging/logger.service';
import { initDatadogTracer } from './common/logging/datadog-apm';

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

function validateEnvironment(): void {
  const logger = getGlobalLogger().child('EnvValidation');
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }
    logger.warn(`Missing environment variables (non-production, defaults may apply): ${missing.join(', ')}`);
  }
}

async function bootstrap(): Promise<void> {
  initDatadogTracer();

  const logger = getGlobalLogger().child('Bootstrap');
  logger.log('Starting Zayjar platform API bootstrap sequence...');

  validateEnvironment();

  const secretsService = new SecretsManagerService();
  await secretsService.loadSecrets();

  const app = await NestFactory.create(AppModule, {
    logger: new ZayjarLogger('NestJS'),
  });

  app.use(require('express').json({
    limit: '10mb',
    verify: (req: Record<string, unknown>, _res: unknown, buf: Buffer) => {
      if (req.method === 'POST' && req.path === '/api/v1/billing/webhooks') {
        (req as Record<string, unknown>).rawBody = Buffer.from(buf);
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

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    const origins = corsOrigin.split(',').map((o) => o.trim());
    app.enableCors({
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Branch-ID', 'X-CSRF-Token', 'X-Request-ID'],
    });
    logger.log(`CORS configured for origins: ${origins.join(', ')}`);
  } else {
    app.enableCors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
    logger.warn('CORS_ORIGIN not set — allowing all origins (development mode only)');
  }

  app.enableShutdownHooks();

  const port = process.env.PORT || 8000;
  await app.listen(port);

  logger.log(`Zayjar API running on port ${port}`);
}

bootstrap();
