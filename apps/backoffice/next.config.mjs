import securityHeaderConfig from '../../config/security-headers.cjs';

const { buildNextSecurityHeaders } = securityHeaderConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return buildNextSecurityHeaders('backoffice', process.env.NODE_ENV === 'production');
  },
  async rewrites() {
    const apiBaseUrl = process.env.API_PROXY_TARGET || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${apiBaseUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
