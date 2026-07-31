import type { Metadata, Viewport } from 'next';
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
  },
  twitter: { card: 'summary_large_image', title: 'ANICA Wellness Spa' },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH">
      <body className="min-h-full antialiased">
        {children}
        <RegisterServiceWorker version={buildId} />
      </body>
    </html>
  );
}
