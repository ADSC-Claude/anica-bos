import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';

export const metadata = {
  title: 'Opening soon',
  // A holding page is not what anyone should find in a search result, and an
  // indexed placeholder outlives the placeholder by weeks.
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * What the public sees while `site.comingSoon` is on.
 *
 * Deliberately one screen with no navigation: every link would lead somewhere
 * that redirects straight back here. It says who we are, that we are nearly
 * open, and how to reach a person in the meantime — which is the entire job
 * of a page like this.
 */
export default async function ComingSoonPage() {
  const s = await getSettings();
  // Turning the switch off should not leave this page reachable and stale.
  if (!s['site.comingSoon']) redirect('/');

  const tel = s['business.phone'].replace(/\s/g, '');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--color-sand-50)] px-5 py-16 text-center">
      {s['business.logoUrl'] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s['business.logoUrl']} alt={s['business.name']} className="mb-6 h-24 w-auto" />
      ) : null}

      <p className="tracked text-[color:var(--color-ink-500)]">Opening soon</p>
      <h1 className="display mt-2 text-4xl font-bold sm:text-5xl">{s['business.name']}</h1>
      <p className="mt-4 max-w-md text-[color:var(--color-ink-500)]">{s['business.tagline']}</p>

      <div className="mt-8 h-px w-16 bg-[color:var(--color-sand-300)]" />

      <p className="mt-8 max-w-md">
        We are putting the finishing touches to our stays. Bookings open shortly — until then, we
        would still love to hear from you.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a className="btn-brand tracked" href={`mailto:${s['business.email']}`}>
          Email us
        </a>
        <a className="btn-brand tracked" href={`tel:${tel}`}>
          Call {s['business.phone']}
        </a>
      </div>

      {(s['business.facebook'] || s['business.instagram']) && (
        <div className="mt-6 flex gap-4 text-sm">
          {s['business.facebook'] && (
            <a className="hover:underline" href={s['business.facebook']}>
              Facebook
            </a>
          )}
          {s['business.instagram'] && (
            <a className="hover:underline" href={s['business.instagram']}>
              Instagram
            </a>
          )}
        </div>
      )}

      <p className="mt-12 text-xs text-[color:var(--color-ink-500)]">
        © {new Date().getFullYear()} {s['business.name']} · {s['business.address']}
      </p>
    </main>
  );
}
