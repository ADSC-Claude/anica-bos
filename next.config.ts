import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  /*
   * Next's image optimiser is switched off: the one `<Image>` in this app is
   * a visitor's uploaded screenshot, shown as a data URL, and it already
   * passes `unoptimized` for that reason. With no `remotePatterns` declared
   * the endpoint refused outside addresses anyway, but it would still fetch
   * and decode one of our own files on request — and it is the endpoint the
   * unauthenticated remote-code-execution advisory patched in 15.5.25 lives
   * on. Off, the route is not built, which costs this app nothing.
   */
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
