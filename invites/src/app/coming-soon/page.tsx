import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { ContactButtons } from '@/components/ui';

export const metadata = { title: 'Opening soon', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ComingSoon() {
  const s = await getSettings();
  if (!s['site.comingSoon']) redirect('/');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-16 text-center">
      <p className="eyebrow">Opening soon</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{s['business.name']}</h1>
      <p className="mt-4 max-w-md text-[color:var(--color-ink-700)]">{s['business.tagline']}. Message us to be first in line.</p>
      <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} className="mt-6 justify-center" />
    </main>
  );
}
