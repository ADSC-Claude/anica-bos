import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Lato } from 'next/font/google';
import './globals.css';
import { RegisterServiceWorker } from '@/components/register-sw';
import { appUrlObject } from '@/lib/app-url';

export const metadata: Metadata = {
  metadataBase: appUrlObject(),
  title: {
    default: 'ANICA Wellness Spa — Quezon City',
    template: '%s · ANICA Wellness Spa',
  },
  description:
    'ANICA Wellness Spa in Quezon City — massage, body scrub, foot spa and sauna. Open 12nn to 12mn daily. Book online.',
  applicationName: 'ANICA BOS',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ANICA' },
  openGraph: {
    title: 'ANICA Wellness Spa — Quezon City',
    description:
      'Massage, body scrub, foot spa and sauna in Quezon City. Open 12nn–12mn daily. Reserve your slot online.',
    type: 'website',
    locale: 'en_PH',
    siteName: 'ANICA Wellness Spa',
    // Without this, a shared link has nothing to show and every app falls back
    // to guessing at a favicon — which is how the old green tile kept turning
    // up long after the palette moved to brown. A card is metadata, never a
    // picture of the page: nothing here is read off the landing page itself.
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'ANICA Wellness Spa',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ANICA Wellness Spa',
    // summary_large_image was already declared with no image to fill it.
    images: ['/og.png'],
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#6b4e35',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Identifies this deployment to the service worker, so a new deployment
 * registers a new worker and the previous one's caches are dropped. Vercel sets
 * both of these; anywhere else the fallback is fine, because a machine serving
 * one build has no stale build to clear.
 */
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

/**
 * Both faces are self-hosted by next/font: the files are downloaded at build
 * time and served from this origin. Nothing is fetched from Google at runtime,
 * so there is no third-party request on a page a client loads, and no flash of
 * fallback text while a stylesheet resolves.
 *
 * Cormorant carries headings and the wordmark; Lato carries everything a person
 * actually reads. `display: 'swap'` shows the fallback rather than nothing if a
 * file is slow — on Philippine mobile data, invisible text is the worse failure.
 */
const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-face',
  display: 'swap',
});

const body = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-body-face',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-full antialiased">
        {children}
        <RegisterServiceWorker version={buildId} />
      </body>
    </html>
  );
}
