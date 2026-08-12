import securityHeaderConfig from '../../config/security-headers.cjs';

const { buildNextSecurityHeaders } = securityHeaderConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return buildNextSecurityHeaders('cashier', process.env.NODE_ENV === 'production');
  },
  async rewrites() {
    const apiBase = (process.env.API_PROXY_TARGET || 'http://localhost:8000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};
export default nextConfig;
