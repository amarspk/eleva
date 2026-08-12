import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildNextSecurityHeaders } = require('../../../../config/security-headers.cjs');

describe('AUDIT-020 Cashier security headers', () => {
  const headers = Object.fromEntries(
    buildNextSecurityHeaders('cashier', true)[0].headers.map((header: { key: string; value: string }) => [
      header.key,
      header.value,
    ]),
  );

  it('wires the shared policy into next.config.mjs', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../../next.config.mjs'), 'utf8');
    expect(config).toContain("buildNextSecurityHeaders('cashier'");
    expect(config).toContain('poweredByHeader: false');
  });

  it('uses report-only CSP that preserves the PWA service worker and API synchronization', () => {
    const csp = headers['Content-Security-Policy-Report-Only'];
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).not.toContain(' wss:');
    expect(headers['Cross-Origin-Embedder-Policy']).toBeUndefined();
  });

  it('supplies frame, MIME, referrer and production transport protection', () => {
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-XSS-Protection']).toBe('0');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
  });
});
