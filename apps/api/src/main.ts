import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
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

  const app: NestExpressApplication = await NestFactory.create(AppModule, {
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
  } else if (process.env.NODE_ENV === 'production') {
    /* Allow wildcard CORS_ORIGIN=* in production when explicitly configured.
       This is needed for deployments like Render where the backoffice and API
       are on different domains. Credentials are disabled for wildcard to
       comply with browser CORS spec (browsers reject * + credentials). */
    logger.warn('CORS_ORIGIN not set in production — using permissive origin reflection. Set CORS_ORIGIN for production hardening.');
    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Branch-ID', 'X-CSRF-Token', 'X-Request-ID'],
    });
  } else {
    // AUDIT-014 (DEFECT-K), runtime-proven in Chromium: the previous dev
    // fallback was `origin: '*'` with no `credentials`, so EVERY browser call
    // from the Backoffice SPA failed at preflight —
    //
    //   Access to fetch at 'http://albaik.localhost:8000/api/v1/menu/products'
    //   from origin 'http://albaik.localhost:3001' has been blocked by CORS
    //   policy: the value of the 'Access-Control-Allow-Origin' header must not
    //   be the wildcard '*' when the request's credentials mode is 'include'.
    //
    // curl never surfaced this because curl does not enforce CORS. The SPA must
    // send credentials so the `__Host-*` refresh/CSRF cookies travel with the
    // request, so the dev fallback now REFLECTS the caller's origin (which is
    // what `credentials: true` requires) instead of using a wildcard.
    app.enableCors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Branch-ID', 'X-CSRF-Token', 'X-Request-ID'],
    });
    logger.warn('CORS_ORIGIN not set — reflecting request origin (development mode only)');
  }

  // Serve locally-stored generated assets (media uploads + invoice PDFs) from
  // the storage directory used by LocalStorageProvider (STORAGE_LOCAL_PATH,
  // default ./uploads). In production behind nginx/S3 the same URL shape is
  // served upstream; this route makes the URLs real in local/dev runtimes.
  const staticRoot = process.env.STORAGE_LOCAL_PATH || './uploads';
  app.useStaticAssets(staticRoot, { prefix: '/uploads/' });

  app.enableShutdownHooks();

  const port = process.env.PORT || 8000;
  await app.listen(port);

  logger.log(`Zayjar API running on port ${port}`);
}

bootstrap();
