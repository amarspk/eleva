import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildNextSecurityHeaders } = require('../../../../config/security-headers.cjs');

describe('AUDIT-020 QR menu security headers', () => {
  const headers = Object.fromEntries(
    buildNextSecurityHeaders('qr-menu', true)[0].headers.map((header: { key: string; value: string }) => [
      header.key,
      header.value,
    ]),
  );

  it('wires the shared policy into next.config.mjs', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../../next.config.mjs'), 'utf8');
    expect(config).toContain("buildNextSecurityHeaders('qr-menu'");
    expect(config).toContain('poweredByHeader: false');
  });

  it('protects tokenized QR URLs and supplies the required production baseline', () => {
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-XSS-Protection']).toBe('0');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
  });

  it('uses report-only CSP compatible with tenant HTTPS media and Next inline styles', () => {
    const csp = headers['Content-Security-Policy-Report-Only'];
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).not.toContain(' wss:');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers['Cross-Origin-Embedder-Policy']).toBeUndefined();
  });
});
