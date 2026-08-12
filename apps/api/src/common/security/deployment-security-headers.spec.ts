import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');

describe('AUDIT-020 deployment header consistency', () => {
  it('neutralizes legacy XSS filtering and supplies HSTS at every standalone nginx server', () => {
    const nginx = fs.readFileSync(path.join(REPO_ROOT, 'nginx.conf'), 'utf8');

    expect(nginx).not.toContain('X-XSS-Protection "1; mode=block"');
    expect(nginx.match(/X-XSS-Protection "0" always/g)?.length).toBeGreaterThanOrEqual(3);
    expect(nginx.match(/Strict-Transport-Security "max-age=31536000" always/g)?.length).toBeGreaterThanOrEqual(3);
    // The wildcard QR host already enforced CSP before AUDIT-020. Preserve that
    // control (do not weaken it to report-only) while making tenant HTTPS media,
    // Next hydration/inline styles, clickjacking and object/base protections
    // explicit. Backoffice/Cashier remain app-level Report-Only.
    expect(nginx.match(/add_header Content-Security-Policy\s+"/g)).toHaveLength(1);
    expect(nginx).toContain("object-src 'none'");
    expect(nginx).toContain("frame-ancestors 'none'");
    expect(nginx).toContain("img-src 'self' data: blob: https:");
  });

  it('applies the CloudFront media response policy to default and product paths', () => {
    const cloudfront = fs.readFileSync(
      path.join(REPO_ROOT, 'infra/cloudfront/distribution.yml'),
      'utf8',
    );

    expect(cloudfront.match(/ResponseHeadersPolicyId: !Ref ImageResponseHeadersPolicy/g)).toHaveLength(2);
    expect(cloudfront).toContain('Cross-Origin-Resource-Policy');
    expect(cloudfront).toContain('Value: cross-origin');
    expect(cloudfront).toContain('StrictTransportSecurity:');
  });

  it('keeps Kubernetes TLS redirects while application headers protect direct service paths', () => {
    const ingress = fs.readFileSync(path.join(REPO_ROOT, 'k8s/ingress.yml'), 'utf8');
    expect(ingress).toContain('nginx.ingress.kubernetes.io/ssl-redirect: "true"');
    expect(ingress).toContain('nginx.ingress.kubernetes.io/force-ssl-redirect: "true"');
  });
});
