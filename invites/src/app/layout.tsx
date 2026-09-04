import type { Metadata } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import './globals.css';
import { getSettings } from '@/lib/settings';
import { appUrl } from '@/lib/app-url';

/**
 * Both faces are downloaded at build time and served from our own origin —
 * `next/font` does not leave a request to Google in the page, which matters
 * for a site that has to load on mobile data.
 */
const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
  weight: ['400', '500', '600'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: `${s['business.name']} — ${s['business.tagline']}`, template: `%s · ${s['business.name']}` },
    description: s['business.intro'],
    keywords: ['digital wedding invitation Philippines', 'online invitation Philippines', 'debut invitation digital', 'christening invitation online', 'e-invite Philippines', 'RSVP link'],
    openGraph: { type: 'website', siteName: s['business.name'], title: s['business.name'], description: s['business.intro'], locale: 'en_PH' },
    robots: s['site.comingSoon'] ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
