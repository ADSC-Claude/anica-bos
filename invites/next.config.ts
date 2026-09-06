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
  async redirects() {
    // Anything shared before invitations moved to the root — a QR already
    // printed, a link already sent — keeps working.
    return [{ source: '/i/:path*', destination: '/:path*', permanent: true }];
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
        // Everything, invitations included, may only be framed by this origin.
        //
        // This used to exempt guest invitations by matching /((?!i/).*), which
        // stopped being expressible when they moved to the root: a slug can be
        // any word, so there is no prefix left to carve out. SAMEORIGIN keeps
        // the two places that actually frame an invitation working — the
        // builder's live preview and the phone mockup on the landing page, both
        // same-origin — and the exemption was never needed for them. What it
        // gives up is embedding an invitation on somebody else's site, which
        // nothing offers today. If that ever becomes a feature it wants
        // frame-ancestors and a deliberate allowlist, not a hole in a regex.
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ];
  },
};

export default nextConfig;
