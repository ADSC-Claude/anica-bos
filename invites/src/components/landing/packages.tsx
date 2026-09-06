'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ServiceMode, Tier } from '@prisma/client';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { SERVICE_MODES } from '@/lib/pricing';
import { formatPesoShort } from '@/lib/money';

export type PackageCard = { tier: Tier; name: string; tagline: string; priceCents: number; dfyFeeCents: number; conciergeFeeCents: number; editsAfterPublish: number; linkValidityDays: number };
export type AddOnCard = { code: string; name: string; description: string; priceCents: number; quoted: boolean };

const HIGHLIGHTS: Record<Tier, string[]> = {
  BASIC: ['1 design from the Basic set', 'Cover, countdown, ceremony & reception with Maps + Waze', 'Parents, dress code with motif swatches', '1 cover photo', 'Simple RSVP form', '3 edits after publish · link valid 30 days after'],
  STANDARD: ['Any template + palette presets', 'Everything in Basic', 'Entourage (ninong & ninang, sponsors, wedding party)', 'Our story, gift note with GCash QR, FAQ, hashtag', 'Gallery up to 10 photos + background music', 'RSVP dashboard + Excel export · custom link', 'Unlimited edits · link valid 6 months after'],
  COMPLETE: ['Premium designs + full custom palette & fonts', 'Everything in Standard', 'Per-guest personalised links with reserved seats', 'Guest list manager, seating chart, QR check-in', 'Meal choice, plus-one control, auto-close RSVP', 'Program, travel tips, guestbook, unlimited gallery + video', 'Password option · priority support · link valid 1 year after'],
};

export function Packages({ packages, addOns }: { packages: PackageCard[]; addOns: AddOnCard[] }) {
  const [mode, setMode] = useState<ServiceMode>('DIY');
  const fee = (p: PackageCard) => (mode === 'DFY' ? p.dfyFeeCents : mode === 'CONCIERGE' ? p.conciergeFeeCents : 0);
  return (
    <div>
      <div className="mx-auto mb-6 flex w-fit rounded-full border border-[color:var(--color-sand-300)] bg-white p-1 text-sm" role="tablist" aria-label="Service mode">
        {SERVICE_MODES.map((m) => (
          <button key={m.key} role="tab" aria-selected={mode === m.key} type="button" onClick={() => setMode(m.key)} className={`rounded-full px-4 py-2 ${mode === m.key ? 'bg-[color:var(--color-plum-600)] text-white' : ''}`}>{m.label}</button>
        ))}
      </div>
      <p className="mb-6 text-center text-sm text-[color:var(--color-ink-500)]">{SERVICE_MODES.find((m) => m.key === mode)?.blurb} Turnaround: {SERVICE_MODES.find((m) => m.key === mode)?.turnaround}.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const p = packages.find((x) => x.tier === t);
          if (!p) return null;
          const popular = t === 'STANDARD';
          return (
            <article key={t} className={`card relative flex flex-col p-6 ${popular ? 'border-[color:var(--color-plum-600)] ring-1 ring-[color:var(--color-plum-600)]' : ''}`}>
              {popular && <span className="pill pill-info absolute -top-3 left-6">Most popular</span>}
              <p className="eyebrow">{TIER_LABELS[t]}</p>
              <p className="display mt-2 text-4xl">{formatPesoShort(p.priceCents + fee(p))}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">{fee(p) ? `${formatPesoShort(p.priceCents)} package + ${formatPesoShort(fee(p))} ${mode === 'DFY' ? 'Done-For-You' : 'Concierge'}` : 'one-time · no subscription'}</p>
              <p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{p.tagline}</p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">{HIGHLIGHTS[t].map((h) => <li key={h} className="flex gap-2"><span aria-hidden className="text-[color:var(--color-plum-600)]">✓</span>{h}</li>)}</ul>
              <Link href={`/checkout?tier=${t}&mode=${mode}`} className={`btn mt-5 ${popular ? 'btn-primary' : 'btn-secondary'}`}>{mode === 'DIY' ? 'Start building' : 'Let us do it'}</Link>
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
