import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/lib/settings';
import { appUrl } from '@/lib/app-url';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: `${s['business.name']} — ${s['business.tagline']}`, template: `%s · ${s['business.name']}` },
    description: s['business.intro'],
    openGraph: {
      type: 'website',
      siteName: s['business.name'],
      title: s['business.name'],
      description: s['business.intro'],
      locale: 'en_PH',
    },
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
