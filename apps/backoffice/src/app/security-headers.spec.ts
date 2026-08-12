import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildNextSecurityHeaders } = require('../../../../config/security-headers.cjs');

describe('AUDIT-020 Backoffice security headers', () => {
  const headers = Object.fromEntries(
    buildNextSecurityHeaders('backoffice', true)[0].headers.map(
      (header: { key: string; value: string }) => [header.key, header.value],
    ),
  );

  it('wires the shared policy into next.config.mjs', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../../next.config.mjs'), 'utf8');
    expect(config).toContain("buildNextSecurityHeaders('backoffice'");
    expect(config).toContain('poweredByHeader: false');
  });

  it('preserves clipboard writes while denying unused sensitive capabilities', () => {
    expect(headers['Permissions-Policy']).toContain('clipboard-write=(self)');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('microphone=()');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });

  it('uses report-only CSP with Socket.IO HTTPS/WSS connectivity', () => {
    const csp = headers['Content-Security-Policy-Report-Only'];
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(csp).toContain("connect-src 'self' https: wss:");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(headers['Cross-Origin-Embedder-Policy']).toBeUndefined();
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000');
  });
});
