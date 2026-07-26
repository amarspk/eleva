import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SecretsManagerService } from './common/secrets/secrets-manager.service';
import { ZayjarLogger, getGlobalLogger } from './common/logging/logger.service';
import { initDatadogTracer } from './common/logging/datadog-apm';

async function bootstrap() {
  initDatadogTracer();

  const logger = getGlobalLogger().child('Bootstrap');
  logger.log('Starting Zayjar platform API bootstrap sequence...');

  const secretsService = new SecretsManagerService();
  await secretsService.loadSecrets();

  const app = await NestFactory.create(AppModule, {
    logger: new ZayjarLogger('NestJS'),
  });

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
