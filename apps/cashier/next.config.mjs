/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = (process.env.API_PROXY_TARGET || 'http://localhost:8000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};
export default nextConfig;
