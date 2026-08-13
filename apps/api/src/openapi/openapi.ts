import type { INestApplication } from '@nestjs/common';
import type { Request, RequestHandler, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { JWT_CONFIG } from '../auth/config/jwt.config';
import { applyOpenApiContract } from './openapi.contract';
import { OPENAPI_SCHEMAS } from './openapi.schemas';

export const SWAGGER_UI_PATH = '/api/docs';
export const OPENAPI_JSON_PATH = '/api/docs-json';

interface DocsJwtPayload {
  sub?: string;
  roles?: unknown;
  iat?: number;
}

interface DocsAuthorizationDependencies {
  jwtService: Pick<JwtService, 'verify'>;
  authService: Pick<AuthService, 'isTokenBlacklisted' | 'getUserRevocationCutoff'>;
}

function sendError(res: Response, statusCode: number, message: string): void {
  if (statusCode === 401) {
    // Basic with the JWT as the password lets a normal browser retain the same
    // credential for the UI bundle and JSON subrequests. Bearer remains the
    // direct API-client option; both transports verify the identical JWT.
    res.setHeader('WWW-Authenticate', [
      'Basic realm="Eleva API documentation", charset="UTF-8"',
      'Bearer realm="Eleva API documentation"',
    ]);
  }
  res.status(statusCode).json({
    statusCode,
    message,
    error: statusCode === 401 ? 'Unauthorized' : statusCode === 403 ? 'Forbidden' : 'Service Unavailable',
  });
}

function extractDocsToken(header: string | undefined): string | undefined {
  const bearerMatch = header?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1].trim();
  }
  const basicMatch = header?.match(/^Basic\s+(.+)$/i);
  if (!basicMatch) {
    return undefined;
  }
  const decoded = Buffer.from(basicMatch[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  return separator >= 0 ? decoded.slice(separator + 1).trim() : undefined;
}

/**
 * Protects the generated UI and JSON with the same signed JWT, blacklist, and
 * per-user revocation controls used by JwtStrategy, then enforces PLATFORM_OWNER.
 * The token may use Bearer transport or browser-compatible Basic transport
 * (token as password); no username is trusted and authorization is JWT-derived.
 * Documentation routes are raw Swagger middleware, not controller handlers, so
 * this adapter is required instead of pretending a controller guard covers them.
 */
export function createOpenApiAccessGuard(dependencies: DocsAuthorizationDependencies): RequestHandler {
  return (req: Request, res: Response, next): void => {
    void (async (): Promise<void> => {
      const token = extractDocsToken(req.headers.authorization);
      if (!token) {
        sendError(res, 401, 'A PLATFORM_OWNER access token is required to access API documentation.');
        return;
      }
      let payload: DocsJwtPayload;
      try {
        payload = dependencies.jwtService.verify<DocsJwtPayload>(token, {
          secret: JWT_CONFIG.accessTokenSecret,
        });
      } catch {
        sendError(res, 401, 'The API documentation access token is invalid or expired.');
        return;
      }

      if (!payload.sub || !Array.isArray(payload.roles)) {
        sendError(res, 401, 'The API documentation access token is missing required identity claims.');
        return;
      }
      if (await dependencies.authService.isTokenBlacklisted(token)) {
        sendError(res, 401, 'The API documentation access token has been revoked.');
        return;
      }
      const revokedAt = await dependencies.authService.getUserRevocationCutoff(payload.sub);
      if (revokedAt > 0 && typeof payload.iat === 'number' && payload.iat < revokedAt) {
        sendError(res, 401, 'The API documentation access token has been revoked.');
        return;
      }
      if (!(payload.roles as unknown[]).includes('PLATFORM_OWNER')) {
        sendError(res, 403, 'API documentation access requires the PLATFORM_OWNER role.');
        return;
      }
      next();
    })().catch(() => {
      if (!res.headersSent) {
        sendError(res, 503, 'API documentation authorization is temporarily unavailable.');
      }
    });
  };
}

function makeOperationIdsUnique(document: OpenAPIObject): void {
  const used = new Set<string>();
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [verb, value] of Object.entries(pathItem ?? {})) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(verb)) {
        continue;
      }
      const operation = value as { operationId?: string };
      const base = operation.operationId || `${verb}_${path}`;
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate)) {
        candidate = `${base}_${suffix++}`;
      }
      operation.operationId = candidate;
      used.add(candidate);
    }
  }
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  applyOpenApiContract();
  const config = new DocumentBuilder()
    .setTitle('Eleva Restaurant SaaS API')
    .setDescription(
      'Runtime OpenAPI contract for the current REST API. Tenant context is resolved from X-Tenant-ID, a tenant subdomain, or a custom domain. For authenticated non-platform users, the signature-verified JWT tenant is authoritative.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Short-lived staff JWT access token.' },
      'bearer',
    )
    .addSecurity('tenantContext', {
      type: 'apiKey',
      in: 'header',
      name: 'X-Tenant-ID',
      description: 'Optional explicit tenant context. Host subdomain/custom-domain resolution is also supported; JWT tenant identity remains authoritative for authenticated non-platform users.',
    })
    .addSecurity('csrfToken', {
      type: 'apiKey',
      in: 'header',
      name: 'X-CSRF-Token',
      description: 'Required on authenticated mutating requests and validated against the server-side token bound to the JWT subject.',
    })
    .addSecurity('refreshCookie', {
      type: 'apiKey',
      in: 'cookie',
      name: '__Host-Refresh-Token',
      description: 'Secure HttpOnly refresh cookie used only by POST /api/v1/auth/refresh.',
    })
    .addSecurity('stripeSignature', {
      type: 'apiKey',
      in: 'header',
      name: 'stripe-signature',
      description: 'Stripe billing webhook signature over the raw request body.',
    })
    .addSecurity('tapHashstring', {
      type: 'apiKey',
      in: 'header',
      name: 'hashstring',
      description: 'Tap Payments HMAC-SHA256 webhook hashstring.',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });
  document.components = {
    ...document.components,
    schemas: {
      ...(document.components?.schemas ?? {}),
      ...OPENAPI_SCHEMAS,
    },
  };
  makeOperationIdsUnique(document);
  return document;
}

export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const guard = createOpenApiAccessGuard({
    jwtService: app.get(JwtService),
    authService: app.get(AuthService),
  });
  // Prefix matching protects the HTML and every Swagger UI asset. The JSON is
  // a separate exact route. Tenant middleware exemptions remain limited to
  // this documentation namespace and never cover deeper application APIs.
  app.use(SWAGGER_UI_PATH, guard);
  app.use(OPENAPI_JSON_PATH, guard);

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: 'Eleva API Documentation',
    swaggerOptions: {
      persistAuthorization: false,
      displayRequestDuration: true,
    },
  });
  return document;
}
