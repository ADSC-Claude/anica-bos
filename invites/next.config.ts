import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  images: {
    /*
     * Next's image optimiser is switched off, because nothing in this app
     * uses it.
     *
     * Every photograph a guest or a member of staff sees is an `<img>` — the
     * Messenger in-app browser is not fond of srcset surprises — and the
     * resizing that does happen is Supabase's own render endpoint, which
     * `imageUrl()` in src/lib/images.ts builds by rewriting the object URL.
     * `next/image` is imported nowhere; `grep -r "next/image" src/` returns
     * nothing.
     *
     * What the config used to say was `remotePatterns: [{ hostname: '**' }]`,
     * and with nothing of ours behind it that made `/_next/image` an open
     * image proxy: anybody could hand our server any address on the internet
     * and have it fetched and served back under our domain and at our
     * expense. It is also the endpoint the unauthenticated remote-code-
     * execution advisory patched in 15.5.25 lives on, so leaving it reachable
     * for a feature we do not use was two risks for no benefit.
     *
     * Off, the route is not built at all: `/_next/image` answers 404 for an
     * outside address and for one of our own files alike, rather than
     * fetching anything. Measured, not assumed — with the old config the same
     * outside address came back 500, which is the optimiser having accepted
     * the address and failed to resolve it. If a page ever does want
     * `next/image`, this comes back as an allowlist of the real hosts, never
     * as `'**'`.
     */
    unoptimized: true,
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
