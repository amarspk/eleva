'use strict';

/**
 * AUDIT-020 — application-specific browser security headers.
 *
 * CSP is report-only for this first rollout. Next.js hydration emits framework
 * bootstrap scripts, the product uses dynamic inline styles for tenant colors,
 * and media/socket endpoints are configurable. Enforcing a copied/default CSP
 * before collecting compatibility evidence would be a production regression.
 */

const COMMON_HEADERS = Object.freeze({
  contentTypeOptions: 'nosniff',
  frameOptions: 'DENY',
  xssProtection: '0',
  hsts: 'max-age=31536000',
});

const APP_POLICIES = Object.freeze({
  'qr-menu': Object.freeze({
    // QR URLs carry the table token in the query string. Never disclose that
    // URL to tenant-controlled HTTPS image origins through the Referer header.
    referrerPolicy: 'no-referrer',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  }),
  backoffice: Object.freeze({
    referrerPolicy: 'strict-origin-when-cross-origin',
    // TablesModule uses navigator.clipboard to copy QR tokens.
    permissionsPolicy:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-write=(self)',
  }),
  cashier: Object.freeze({
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  }),
});

function buildCspReportOnly(appName, isProduction) {
  const socketConnections = appName === 'backoffice' ? ' wss:' : '';
  const developmentConnections = isProduction
    ? ''
    : appName === 'backoffice'
      ? ' http: ws:'
      : ' http:';
  const developmentScripts = isProduction ? '' : " 'unsafe-eval'";
  const developmentImages = isProduction ? '' : ' http:';
  const workerSources = appName === 'cashier' ? "'self' blob:" : "'self'";

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // `unsafe-inline` remains report-only compatibility documentation for the
    // current Next.js bootstrap. Enforcement requires a nonce/hash rollout.
    `script-src 'self' 'unsafe-inline'${developmentScripts}`,
    // React style props implement tenant colors/cover images in current source.
    "style-src 'self' 'unsafe-inline'",
    // Tenant-controlled product/logo/cover media is allowed over HTTPS. data:
    // and blob: cover previews and framework-generated resources.
    `img-src 'self' data: blob: https:${developmentImages}`,
    "font-src 'self' data:",
    // Backoffice KDS uses Socket.IO (polling + WebSocket); other apps use
    // same-origin API rewrites and can also use configured HTTPS endpoints.
    `connect-src 'self' https:${socketConnections}${developmentConnections}`,
    `worker-src ${workerSources}`,
    "manifest-src 'self'",
    "media-src 'self' https:",
    "frame-src 'none'",
  ];

  return directives.join('; ');
}

function buildNextSecurityHeaders(appName, isProduction = process.env.NODE_ENV === 'production') {
  const policy = APP_POLICIES[appName];
  if (!policy) {
    throw new Error(`Unknown security-header application: ${appName}`);
  }

  const headers = [
    { key: 'X-Content-Type-Options', value: COMMON_HEADERS.contentTypeOptions },
    { key: 'X-Frame-Options', value: COMMON_HEADERS.frameOptions },
    { key: 'Referrer-Policy', value: policy.referrerPolicy },
    { key: 'Permissions-Policy', value: policy.permissionsPolicy },
    { key: 'X-XSS-Protection', value: COMMON_HEADERS.xssProtection },
    {
      key: 'Content-Security-Policy-Report-Only',
      value: buildCspReportOnly(appName, isProduction),
    },
  ];

  if (isProduction) {
    headers.push({ key: 'Strict-Transport-Security', value: COMMON_HEADERS.hsts });
  }

  // COEP and CORP are intentionally absent. COEP would break non-isolated
  // media/socket/PWA flows; CORP belongs on the resource response (the API marks
  // public /uploads/ as cross-origin), not on every HTML document.
  return [{ source: '/(.*)', headers }];
}

module.exports = {
  APP_POLICIES,
  COMMON_HEADERS,
  buildCspReportOnly,
  buildNextSecurityHeaders,
};
