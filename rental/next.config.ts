import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  /*
   * Next's image optimiser is switched off: nothing in this app imports
   * `next/image`, so the endpoint served no page of ours and only offered a
   * stranger a way to have our server fetch and decode a picture. It is also
   * where the unauthenticated remote-code-execution advisory patched in
   * 15.5.25 lived. Off, the route is not built.
   */
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // The service worker controls the whole origin so the cleaner's
        // checklist keeps working in a stairwell.
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
