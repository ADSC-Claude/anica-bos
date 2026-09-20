import Link from 'next/link';
import type { Tier } from '@prisma/client';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { SERVICE_MODES, DEFAULT_SERVICE_MODE } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';
import { offerPrice, offerHeadline, offerLeftLine, type LaunchOffer } from '@/lib/launch';

export type PackageCard = { tier: Tier; name: string; tagline: string; priceCents: number; dfyFeeCents: number; conciergeFeeCents: number; revisionRounds: number; linkValidityDays: number };
/**
 * Kept although this section no longer lists them: the checkout's own
 * add-on step takes the same shape, and the type is the shared description
 * of what an add-on looks like to a customer.
 */
export type AddOnCard = { code: string; name: string; description: string; imageUrl: string; priceCents: number; quoted: boolean };

/*
 * What each package promises, in the customer's words.
 *
 * Basic and Standard are no longer sold — their Package rows are switched
 * off, so `sold` leaves them out and these two lists go unread. They are
 * kept rather than deleted because the decision lives in the database, and
 * switching a row back on in Admin should bring its card back whole rather
 * than blank.
 *
 * Signature used to say "Everything in Standard", which stopped meaning
 * anything the moment Standard stopped existing. It now names what it
 * carries.
 */
const HIGHLIGHTS: Record<Tier, string[]> = {
  BASIC: ['1 design from the Basic set, in its own colours', 'Set in the Modern font style', 'Cover, countdown, ceremony & reception with Maps + Waze', 'Dress code with motif swatches', '1 cover photo', 'Simple RSVP form — guests say which group they are from', 'We build it for you, with 2 rounds of changes before we publish', 'Link valid 30 days after the event'],
  STANDARD: ['Any template, 3 font styles to choose from', 'Everything in Basic', 'Entourage (ninong & ninang, sponsors, wedding party)', 'Our story, gift note with GCash QR, FAQ, hashtag', '5 to 7 photos + background music', 'RSVP dashboard, Excel export, printable headcount sheet · custom link', 'We build it for you, with 4 rounds of changes before we publish', 'Link valid 6 months after the event'],
  COMPLETE: ['Signature-only designs, all 5 font styles', 'Cover, countdown, ceremony and reception with Maps + Waze, dress code', 'Entourage, our story, gift note with GCash QR, FAQ, hashtag', 'RSVP dashboard, Excel export, printable headcount sheet · custom link', 'Meal choice on the RSVP, counted for your caterer', 'Auto-close RSVP on your deadline', 'Program, guestbook, 10 to 15 photos + video', 'Guest list manager with a personal link per guest', 'We build it for you, with 6 rounds of changes before we publish', 'Password option · link valid 1 year after the event'],
  LUXURY: ['Everything in Signature', 'Seating chart your guests can look themselves up on', 'QR check-in at the door on the day', 'Shared album your guests add photos to afterwards', 'Save the Date card included, not an add-on', 'E-mail confirmation to every guest who accepts, free', 'We build it for you, with 8 rounds of changes before we publish', '20 photos + video · link valid 1 year after the event'],
};

export function Packages({ packages, offer }: { packages: PackageCard[]; offer?: LaunchOffer | null }) {
  // One service, so there is nothing to toggle: the price on the card is the
  // whole price, building included.
  const service = SERVICE_MODES.find((m) => m.key === DEFAULT_SERVICE_MODE)!;
  // null rather than false when there is nothing on, so every price below
  // falls back to the plain one without a second condition
  const off = offer && offer.left > 0 ? offer : null;
  // only the tiers with a package on sale: a tier whose row is switched off
  // in Admin is not a gap in the row, it is not there
  const sold = TIERS.filter((t) => packages.some((x) => x.tier === t));
  return (
    <div>
      {off && (
        <p className="mx-auto mb-5 flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-[color:var(--color-plum-600)] bg-[color:var(--color-plum-50,#faf5ff)] px-5 py-2 text-center">
          <span className="font-semibold text-[color:var(--color-plum-600)]">{offerHeadline(off)}</span>
          <span className="text-sm text-[color:var(--color-ink-700)]">{offerLeftLine(off)}</span>
          <span className="w-full text-xs text-[color:var(--color-ink-500)]">Taken off at checkout — no code needed.</span>
        </p>
      )}
      <p className="mb-6 text-center text-sm text-[color:var(--color-ink-500)]">
        Every package is built for you. You fill in a form, we encode and lay it out — {service.turnaround.toLowerCase()} — and you approve a preview before it goes live.
      </p>
      {/* The grid follows however many packages are actually on sale. Four
          columns with two cards in them leaves half the row empty and reads
          as something missing rather than as a choice of two; two cards take
          two columns, centred, and look deliberate. */}
      <div className={`mx-auto grid gap-4 sm:grid-cols-2 ${sold.length <= 2 ? 'max-w-3xl' : sold.length === 3 ? 'max-w-5xl xl:grid-cols-3' : 'xl:grid-cols-4'}`}>
        {sold.map((t) => {
          const p = packages.find((x) => x.tier === t);
          if (!p) return null;
          const popular = t === 'STANDARD';
          return (
            <article key={t} className={`card relative flex flex-col p-6 ${popular ? 'border-[color:var(--color-plum-600)] ring-1 ring-[color:var(--color-plum-600)]' : ''}`}>
              {popular && <span className="pill pill-info absolute -top-3 left-6">Most popular</span>}
              <p className="eyebrow">{TIER_LABELS[t]}</p>
              {/* While the opening offer is on, the lower number is the
                  price: it is the one set large, and the old one stands
                  beside it struck through so the saving is visible without
                  arithmetic. The checkout applies the same row, so this is
                  what they are charged. When the seats run out the offer
                  disappears from here on its own and the full price is
                  simply the price again. */}
              {off ? (
                <p className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="display text-4xl">{formatPesoShort(offerPrice(p.priceCents, off.percent))}</span>
                  <s className="text-lg text-[color:var(--color-ink-500)]">{formatPesoShort(p.priceCents)}</s>
                </p>
              ) : (
                <p className="display mt-2 text-4xl">{formatPesoShort(p.priceCents)}</p>
              )}
              <p className="text-xs text-[color:var(--color-ink-500)]">
                {off ? <span className="font-semibold text-[color:var(--color-plum-600)]">{off.percent}% off · </span> : null}
                one-time · built for you · no subscription
              </p>
              <p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">{HIGHLIGHTS[t].map((h) => <li key={h} className="flex gap-2"><span aria-hidden className="text-[color:var(--color-plum-600)]">✓</span>{h}</li>)}</ul>
              <Link href={`/checkout?tier=${t}`} className={`btn mt-5 ${popular ? 'btn-primary' : 'btn-secondary'}`}>Get started</Link>
            </article>
          );
        })}
      </div>
      {/*
        * No prices on this page but the packages' own.
        *
        * "I think seeing too much payments after seeing the package will
        * take the customers away." The extras were listed under the cards
        * with a peso figure each, so somebody weighing a ₱4,800 package met
        * six more numbers before they had decided anything.
        *
        * They were first reduced to one line naming them and no figures,
        * and then — "Remove all the add ons etc in the front of the
        * packages. So not too many prices to check." — taken off the page
        * altogether. They are offered at step 5 of the checkout, once a
        * package is chosen and the question has changed from "how much is
        * all this" to "do I want this on mine".
        */}
    </div>
  );
}
