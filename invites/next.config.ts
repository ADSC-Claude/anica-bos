import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Cover photos and gallery images are served from wherever the upload
    // landed — Supabase Storage in production, public/uploads locally — and
    // from the handful of stock hosts the seed uses. <img> is used for guest
    // pages anyway (the Messenger in-app browser is not fond of srcset
    // surprises), so this list only matters for the dashboard thumbnails.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Everything except a guest invitation refuses to be framed. The
        // invitation itself is framed by the builder's live preview and by the
        // phone mockup on the landing page, both same-origin.
        source: '/((?!i/).*)',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
