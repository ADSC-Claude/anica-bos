import Link from 'next/link';
import type { Tier } from '@prisma/client';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { SERVICE_MODES, DEFAULT_SERVICE_MODE } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';

export type PackageCard = { tier: Tier; name: string; tagline: string; priceCents: number; dfyFeeCents: number; conciergeFeeCents: number; revisionRounds: number; linkValidityDays: number };
export type AddOnCard = { code: string; name: string; description: string; priceCents: number; quoted: boolean };

const HIGHLIGHTS: Record<Tier, string[]> = {
  BASIC: ['1 design from the Basic set', 'Your own colours, set in the Modern font style', 'Cover, countdown, ceremony & reception with Maps + Waze', 'Dress code with motif swatches', '1 cover photo', 'Simple RSVP form — guests say which group they are from', 'We build it for you, with 2 rounds of changes before we publish', 'Link valid 30 days after the event'],
  STANDARD: ['Any template, 3 font styles to choose from', 'Everything in Basic', 'Entourage (ninong & ninang, sponsors, wedding party)', 'Our story, gift note with GCash QR, FAQ, hashtag', 'Gallery up to 10 photos + background music', 'RSVP dashboard, Excel export, printable headcount sheet · custom link', 'We build it for you, with 4 rounds of changes before we publish', 'Link valid 6 months after the event'],
  COMPLETE: ['Signature-only designs, all 5 font styles', 'Everything in Standard', 'Meal choice on the RSVP, counted for your caterer', 'Auto-close RSVP on your deadline', 'Program, travel tips, guestbook, unlimited gallery + video', 'We build it for you, with 6 rounds of changes before we publish', 'Password option · link valid 1 year after the event'],
};

export function Packages({ packages, addOns }: { packages: PackageCard[]; addOns: AddOnCard[] }) {
  // One service, so there is nothing to toggle: the price on the card is the
  // whole price, building included.
  const service = SERVICE_MODES.find((m) => m.key === DEFAULT_SERVICE_MODE)!;
  return (
    <div>
      <p className="mb-6 text-center text-sm text-[color:var(--color-ink-500)]">
        Every package is built for you. You fill in a form, we encode and lay it out — {service.turnaround.toLowerCase()} — and you approve a preview before it goes live.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const p = packages.find((x) => x.tier === t);
          if (!p) return null;
          const popular = t === 'STANDARD';
          return (
            <article key={t} className={`card relative flex flex-col p-6 ${popular ? 'border-[color:var(--color-plum-600)] ring-1 ring-[color:var(--color-plum-600)]' : ''}`}>
              {popular && <span className="pill pill-info absolute -top-3 left-6">Most popular</span>}
              <p className="eyebrow">{TIER_LABELS[t]}</p>
              <p className="display mt-2 text-4xl">{formatPesoShort(p.priceCents)}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">one-time · built for you · no subscription</p>
              <p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">{HIGHLIGHTS[t].map((h) => <li key={h} className="flex gap-2"><span aria-hidden className="text-[color:var(--color-plum-600)]">✓</span>{h}</li>)}</ul>
              <Link href={`/checkout?tier=${t}`} className={`btn mt-5 ${popular ? 'btn-primary' : 'btn-secondary'}`}>Get started</Link>
            </article>
          );
        })}
      </div>
      <div className="mt-8">
        <h3 className="mb-2 text-center font-semibold">Add-ons for any package</h3>
        <ul className="mx-auto grid max-w-3xl gap-2 text-sm sm:grid-cols-2">
          {addOns.map((a) => <li key={a.code} className="flex justify-between gap-3 rounded-xl bg-white px-4 py-2"><span>{a.name}<span className="block text-xs text-[color:var(--color-ink-500)]">{a.description}</span></span><span className="whitespace-nowrap font-semibold">{a.quoted ? formatPesoShort(a.priceCents) : 'Ask us'}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
