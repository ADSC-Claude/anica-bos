import Link from 'next/link';
import { getSettings } from '@/lib/settings';
import { buildRefundPolicy, REFUND_POLICY_EFFECTIVE } from '@/lib/refund-policy';
import { cancellationPolicyText } from '@/lib/booking-policy';
import { BrandMark } from '@/components/brand-mark';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Refund policy',
  description:
    'When a reservation fee at ANICA Wellness Spa is refunded, how to ask for a refund, and how long it takes to arrive.',
};

/**
 * The refund policy, on a page of its own.
 *
 * Its own URL rather than a paragraph inside the booking form, for two
 * reasons. A card acquirer requires the policy to be readable by somebody who
 * has not started a booking — that is the point of the requirement, since a
 * policy you can only reach mid-purchase is one you cannot compare beforehand.
 * And a guest looking for it is usually looking *after* something went wrong,
 * which is the worst moment to make her retrace a checkout to find it.
 */
export default async function RefundsPage() {
  const settings = await getSettings();
  const sections = buildRefundPolicy(settings);

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
        <h1 className="text-2xl font-semibold text-cocoa-800">Refund policy</h1>
        <p className="muted mt-1">In effect from {REFUND_POLICY_EFFECTIVE}.</p>

        {/* The rule in one sentence, before the detail. Somebody who arrived
            here from a cancelled booking wants the answer, not a document —
            and the same sentence is what she was shown before she paid. */}
        <div className="mt-5 rounded-xl border border-cocoa-200 bg-cocoa-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cocoa-500">
            The short version
          </p>
          <p className="mt-1.5 text-sm text-cocoa-700">
            {cancellationPolicyText({
              windowHours: settings['booking.cancellationHours'],
              inTimePolicy: settings['booking.depositOnCancel'],
            })}
          </p>
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
          <span className="flex gap-4">
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy notice
            </Link>
            <Link href="/" className="underline underline-offset-4">
              Back to the spa
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
