/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Tenant product/branding imagery is served over HTTPS from the platform
    // media service (and tenant-configured CDNs); localhost is allowed for
    // local development only.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '*.localhost' },
    ],
  },
  async rewrites() {
    // Browser checkout calls the same-origin relative /api/* path.
    // In production nginx terminates /api before the app (these rewrites do
    // not engage); in local dev they proxy to the API service.
    // API_INTERNAL_URL must include the tenant subdomain in dev so
    // TenantContextMiddleware can resolve tenancy (e.g. http://albaik.localhost:3001).
    const apiBase = (process.env.API_INTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
