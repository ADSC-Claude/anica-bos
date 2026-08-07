import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { buildPrivacyNotice, NOTICE_EFFECTIVE } from '@/lib/privacy-notice';
import { PRIVACY_CONSENT } from '@/lib/consent';
import { BrandMark } from '@/components/brand-mark';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Privacy notice',
  description:
    'How ANICA Wellness Spa collects, uses, keeps and erases your personal and health information, under the Philippine Data Privacy Act of 2012.',
};

/**
 * The long version of the sentence beside the tick box.
 *
 * Its own page rather than a modal on the booking form: a notice you have to be
 * mid-booking to read is a notice written for the spa's benefit rather than the
 * client's. This one can be linked to, bookmarked, printed and read by somebody
 * who has not decided to book yet — including by a client who wants to check
 * what the spa holds before asking for it back.
 */
export default async function PrivacyPage() {
  const settings = await getSettings();
  const sections = buildPrivacyNotice(settings);

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="text-sm font-medium text-cocoa-800">
              {settings['business.name']}
            </span>
          </Link>
          <Link href="/book" className="btn-secondary btn-sm">
            Book a slot
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-cocoa-800">Privacy notice</h1>
        <p className="muted mt-1">In effect from {NOTICE_EFFECTIVE}.</p>

        {/* The tick box itself, quoted at the top. Somebody arriving from the
            booking form is usually here to find out what they just agreed to,
            and making them infer it from ten sections below would be a strange
            way to answer that. */}
        <div className="mt-5 rounded-xl border border-cocoa-200 bg-cocoa-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cocoa-500">
            What you tick when you book
          </p>
          <p className="mt-1.5 text-sm text-cocoa-700">{PRIVACY_CONSENT}</p>
          <p className="mt-2 text-xs text-cocoa-500">
            Everything below is that sentence, at length.
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold text-cocoa-800">{section.heading}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-cocoa-600">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-3 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2 text-sm leading-relaxed text-cocoa-600">
                      <span aria-hidden className="text-cocoa-400">
                        •
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-sand-200 bg-sand-100">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-cocoa-500">
          <p>
            © {new Date().getFullYear()} {settings['business.name']} ·{' '}
            {settings['business.address']}
          </p>
          <Link href="/" className="underline underline-offset-4">
            Back to the spa
          </Link>
        </div>
      </footer>
    </div>
  );
}
