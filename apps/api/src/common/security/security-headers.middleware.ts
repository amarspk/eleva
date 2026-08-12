import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * AUDIT-020 — explicit API security headers.
 *
 * This is deliberately not a blanket browser-document policy. The API serves
 * JSON plus public media under `/uploads/`; applying an off-the-shelf CSP/CORP
 * bundle would either add little value to JSON or break cross-origin tenant
 * media. Browser-document CSP is configured per Next.js application instead.
 */
export const API_SECURITY_HEADERS = Object.freeze({
  contentTypeOptions: 'nosniff',
  frameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  hsts: 'max-age=31536000',
  xssProtection: '0',
  uploadsResourcePolicy: 'cross-origin',
});

export interface ApiSecurityHeadersOptions {
  isProduction?: boolean;
}

/**
 * Returns an Express middleware so it can run before body parsing, CORS and
 * static-file handling. It does not read or mutate the request body and does
 * not modify Access-Control-* or Set-Cookie headers.
 */
export function createApiSecurityHeadersMiddleware(
  options: ApiSecurityHeadersOptions = {},
): RequestHandler {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', API_SECURITY_HEADERS.contentTypeOptions);
    res.setHeader('X-Frame-Options', API_SECURITY_HEADERS.frameOptions);
    res.setHeader('Referrer-Policy', API_SECURITY_HEADERS.referrerPolicy);
    res.setHeader('Permissions-Policy', API_SECURITY_HEADERS.permissionsPolicy);

    // The legacy reflective-XSS filter is obsolete and can introduce browser
    // quirks. `0` explicitly disables it; CSP/sanitization remain the controls.
    res.setHeader('X-XSS-Protection', API_SECURITY_HEADERS.xssProtection);

    // Browsers only honor HSTS over HTTPS. Emitting it only from production
    // builds avoids contaminating local development while still protecting
    // direct Render/pod/application paths that bypass the standalone nginx file.
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', API_SECURITY_HEADERS.hsts);
    }

    // Public uploads are intentionally rendered by QR/backoffice/cashier hosts
    // that can differ from the API host. `same-origin` here would break those
    // images/PDFs. JSON routes intentionally omit CORP rather than imposing a
    // policy that conflicts with the existing CORS contract.
    const requestPath = req.path || req.url || '';
    if (requestPath === '/uploads' || requestPath.startsWith('/uploads/')) {
      res.setHeader('Cross-Origin-Resource-Policy', API_SECURITY_HEADERS.uploadsResourcePolicy);
    }

    // COEP is intentionally NOT enabled: current tenant media, CDN resources,
    // Socket.IO and the cashier service worker are not cross-origin isolated.
    next();
  };
}
