'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Occasion, ServiceMode, Tier } from '@prisma/client';
import { OCCASIONS, templateSuits } from '@/lib/occasions';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { TIERS, TIER_LABELS, COMPARISON } from '@/lib/tiers';
import { SERVICE_MODES, quote, DEFAULT_SERVICE_MODE, addOnAvailable, revisionRounds, RUSH_CODE, PRIORITY_CODE, type CouponLike } from '@/lib/pricing';
import { formatPesoShort, formatPeso } from '@/lib/money';
import { placeOrderAction, checkCouponAction } from './actions';
import { invitationPath } from '@/lib/app-url';

export type WizardPackage = { code: string; name: string; tagline: string; occasion: Occasion | null; tier: Tier; priceCents: number; dfyFeeCents: number; conciergeFeeCents: number; revisionRounds: number };
export type WizardAddOn = { code: string; name: string; description: string; priceCents: number; quoted: boolean };
export type WizardTemplate = { id: string; slug: string; name: string; occasion: Occasion; occasions: Occasion[]; minTier: Tier; premium: boolean; thumbnailUrl: string; description: string; palette: { bg: string; accent: string; accent2: string }; /** the premium openings drawn for this design, by name. Empty means the add-on is not sold with it. */ premiumOpenings: string[] };

export type WizardProps = {
  packages: WizardPackage[];
  addOns: WizardAddOn[];
  templates: WizardTemplate[];
  initial: { occasion?: string; tier?: string; template?: string; coupon?: string; addon?: string };
  demoSlug: string;
};

const RANK: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2 };

export function CheckoutWizard(p: WizardProps) {
  const [occasion, setOccasion] = useState<Occasion>((OCCASIONS.some((o) => o.key === p.initial.occasion) ? p.initial.occasion : 'WEDDING') as Occasion);
  const [tier, setTier] = useState<Tier>((TIERS.includes(p.initial.tier as Tier) ? p.initial.tier : 'STANDARD') as Tier);
  // There is one service and it is not a choice: we build every invitation.
  // A ?mode= left in an old link or a bookmark is ignored rather than honoured
  // — the server decides the mode now, and a withdrawn one must not be able to
  // price a page differently from the order it produces.
  const mode = DEFAULT_SERVICE_MODE;
  const [templateId, setTemplateId] = useState<string>(p.initial.template ?? '');
  // an add-on named in the link (the gallery's "with the premium opening") starts ticked
  const [addOns, setAddOns] = useState<string[]>(p.addOns.some((a) => a.code === p.initial.addon && a.quoted) ? [p.initial.addon as string] : []);
  const [couponCode, setCouponCode] = useState(p.initial.coupon ?? '');
  const [coupon, setCoupon] = useState<CouponLike | null>(null);
  const [couponError, setCouponError] = useState('');
  const [language, setLanguage] = useState<'en' | 'tl'>('en');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const pkg = useMemo(() => p.packages.find((x) => x.occasion === occasion && x.tier === tier) ?? p.packages.find((x) => x.occasion === null && x.tier === tier), [p.packages, occasion, tier]);
  const templates = p.templates.filter((t) => templateSuits(t, occasion) && (tier === 'COMPLETE' || !t.premium) && (tier !== 'BASIC' || t.minTier === 'BASIC'));
  const template = templates.find((t) => t.id === templateId) ?? null;
  // the premium opening is sold per design: a design with no clip yet cannot carry it
  const premiumOk = !template || template.premiumOpenings.length > 0;
  const chosenAddOns = p.addOns.filter((a) => addOns.includes(a.code) && a.quoted && (a.code !== PREMIUM_OPENING_CODE || premiumOk));
  const q = useMemo(() => (pkg ? quote({ pkg, serviceMode: mode, addOns: chosenAddOns, occasion, coupon: coupon ?? undefined }) : null), [pkg, mode, chosenAddOns, occasion, coupon]);

  const modeInfo = SERVICE_MODES.find((m) => m.key === mode)!;
  // Rounds are the package's, and buying speed spends some of them: there is no
  // room for four rounds of back-and-forth inside 24 hours, so rush caps them.
  const rushed = chosenAddOns.some((a) => a.code === RUSH_CODE || a.code === PRIORITY_CODE);
  const rounds = pkg ? revisionRounds(tier, rushed, pkg.revisionRounds) : 0;
  const roundsLabel = `${rounds} round${rounds === 1 ? '' : 's'}`;

  async function applyCoupon() {
    setCouponError('');
    if (!couponCode.trim()) {
      setCoupon(null);
      return;
    }
    const gross = q ? q.totalCents + q.discountCents : 0;
    const res = await checkCouponAction(couponCode, gross);
    if (res.ok) setCoupon({ ...res.coupon, expiresAt: res.coupon.expiresAt ? new Date(res.coupon.expiresAt) : null });
    else {
      setCoupon(null);
      setCouponError(res.error);
    }
  }

  function submit() {
    setError('');
    if (!template) {
      setError('Pick a template to continue.');
      document.getElementById('step-template')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    start(async () => {
      const res = await placeOrderAction({ occasion, tier, templateId: template.id, addOnCodes: chosenAddOns.map((a) => a.code), couponCode: coupon?.code, language, notes });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-10">
        {/* 1 — occasion */}
        <section>
          <h2 className="display mb-3 text-xl">1. What are we celebrating?</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OCCASIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => { setOccasion(o.key); setTemplateId(''); }} className={`card p-3 text-left ${occasion === o.key ? 'border-[color:var(--color-plum-600)] ring-2 ring-[color:var(--color-plum-600)]' : ''}`} aria-pressed={occasion === o.key}>
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-xs text-[color:var(--color-ink-500)]">{o.tagalog}{o.phase > 1 ? ` · Phase ${o.phase}` : ''}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 2 — tier */}
        <section>
          <h2 className="display mb-3 text-xl">2. Choose a package</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const row = p.packages.find((x) => x.occasion === occasion && x.tier === t) ?? p.packages.find((x) => x.occasion === null && x.tier === t);
              if (!row) return null;
              return (
                <button key={t} type="button" onClick={() => { setTier(t); if (template && (t === 'BASIC' ? template.minTier !== 'BASIC' : false) || (template?.premium && t !== 'COMPLETE')) setTemplateId(''); }} className={`card p-4 text-left ${tier === t ? 'border-[color:var(--color-plum-600)] ring-2 ring-[color:var(--color-plum-600)]' : ''}`} aria-pressed={tier === t}>
                  <span className="eyebrow">{TIER_LABELS[t]}</span>
                  <span className="display mt-1 block text-2xl">{formatPesoShort(row.priceCents)}</span>
                  <span className="block text-xs text-[color:var(--color-ink-500)]">{row.tagline}</span>
                </button>
              );
            })}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[color:var(--color-plum-600)]">Compare what each package includes</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="data min-w-[36rem]">
                <thead><tr><th>Feature</th>{TIERS.map((t) => <th key={t}>{TIER_LABELS[t]}</th>)}</tr></thead>
                <tbody>
                  {COMPARISON.map((r) => (
                    <tr key={r.label}><td>{r.label}</td>{TIERS.map((t) => <td key={t}>{typeof r.cells[t] === 'boolean' ? (r.cells[t] ? '✓' : '—') : r.cells[t]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {/* 3 — what the package includes; not a choice any more */}
        <section>
          <h2 className="display mb-3 text-xl">3. What happens after you pay</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              { title: 'You tell us the details', body: 'Fill in one form — names, entourage, venues, photos, RSVP. Or send them over Messenger, Viber or an Excel file if that is easier.' },
              { title: 'We build it', body: `Our team encodes and lays out your invitation. ${modeInfo.turnaround}.` },
              { title: 'You approve, we publish', body: `A preview on your phone, ${roundsLabel} of changes, then your link and QR go live.` },
            ].map((step, i) => (
              <li key={step.title} className="card p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-plum-600)] text-sm font-semibold text-white">{i + 1}</span>
                <span className="mt-2 block text-sm font-semibold">{step.title}</span>
                <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{step.body}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">Included in every package — there is no separate encoding fee.</p>
        </section>

        {/* 4 — template */}
        <section id="step-template">
          <h2 className="display mb-3 text-xl">4. Pick a design</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-500)]">No designs are published for this occasion yet — message us and we will build one for you.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {templates.map((tp) => (
                <button key={tp.id} type="button" onClick={() => setTemplateId(tp.id)} className={`card overflow-hidden text-left ${templateId === tp.id ? 'border-[color:var(--color-plum-600)] ring-2 ring-[color:var(--color-plum-600)]' : ''}`} aria-pressed={templateId === tp.id}>
                  <div className="aspect-[9/16] w-full" style={{ background: tp.thumbnailUrl ? `top/cover url(${tp.thumbnailUrl})` : `linear-gradient(160deg, ${tp.palette.bg}, ${tp.palette.accent2})` }}>
                    {!tp.thumbnailUrl && <div className="flex h-full items-end p-3"><span className="display text-lg" style={{ color: tp.palette.accent }}>{tp.name}</span></div>}
                  </div>
                  <div className="p-2">
                    <span className="block text-sm font-semibold">{tp.name}</span>
                    <span className="block text-xs text-[color:var(--color-ink-500)]">{tp.premium ? `${TIER_LABELS.COMPLETE} only` : tp.minTier === 'BASIC' ? 'Basic set' : 'Standard & up'}{tp.premiumOpenings.length ? ' · premium opening add-on' : ''}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">You can switch designs later without losing anything you typed. See a full example: <a href={invitationPath(p.demoSlug)} target="_blank" rel="noopener" className="underline">the demo invitation</a>.</p>
        </section>

        {/* 5 — add-ons */}
        <section>
          <h2 className="display mb-3 text-xl">5. Add-ons <span className="text-sm font-normal text-[color:var(--color-ink-500)]">(optional)</span></h2>
          <div className="space-y-2">
            {p.addOns.map((a) => {
              const offered = a.quoted && addOnAvailable(a.code, tier, occasion) && (a.code !== PREMIUM_OPENING_CODE || premiumOk);
              return (
              <label key={a.code} className={`card flex items-start gap-3 p-3 ${!offered ? 'opacity-70' : ''}`}>
                <input type="checkbox" className="mt-1 h-4 w-4" disabled={!offered} checked={offered && addOns.includes(a.code)} onChange={(e) => setAddOns((s) => (e.target.checked ? [...s, a.code] : s.filter((c) => c !== a.code)))} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{a.name}</span>
                  <span className="block text-xs text-[color:var(--color-ink-500)]">{a.description}</span>
                  {a.code === PREMIUM_OPENING_CODE && template && (template.premiumOpenings.length
                    ? <span className="block text-xs text-[color:var(--color-ink-500)]">For {template.name}: {template.premiumOpenings.join(', ')}{template.premiumOpenings.length > 1 ? ' — choose yours in the builder.' : '.'}</span>
                    : <span className="block text-xs text-[color:var(--color-ink-500)]">Not made for {template.name} yet — pick a design marked “premium opening add-on”.</span>)}
                </span>
                <span className="text-sm font-semibold">{a.quoted ? formatPesoShort(a.priceCents) : 'Ask us'}</span>
              </label>
              );
            })}
          </div>
        </section>

        {/* 6 — details */}
        <section>
          <h2 className="display mb-3 text-xl">6. A couple of details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="language">Guest page language</label>
              <select id="language" className="field" value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'tl')}>
                <option value="en">English</option>
                <option value="tl">Tagalog / Taglish</option>
              </select>
              <p className="hint">Fixed labels like “Ninong at Ninang” and “Paki-confirm bago ang…”. You can change this later.</p>
            </div>
            <div>
              <label className="label" htmlFor="coupon">Coupon code</label>
              <div className="flex gap-2">
                <input id="coupon" className="field uppercase" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="e.g. LAUNCH20" />
                <button type="button" className="btn btn-secondary" onClick={applyCoupon}>Apply</button>
              </div>
              {couponError && <p className="hint text-[color:var(--bad)]">{couponError}</p>}
              {coupon && !couponError && <p className="hint text-[color:var(--ok)]">Applied: {coupon.code}</p>}
            </div>
          </div>
          <div className="mt-3">
            <label className="label" htmlFor="notes">Anything we should know? <span className="font-normal text-[color:var(--color-ink-500)]">(event date, template wishes, rush)</span></label>
            <textarea id="notes" className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>
      </div>

      {/* summary */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="card p-5">
          <p className="eyebrow mb-2">Your order</p>
          {q && pkg ? (
            <>
              <ul className="space-y-1 text-sm">
                {q.items.map((it) => (
                  <li key={it.code} className="flex justify-between gap-3">
                    <span>{it.name}</span>
                    <span className="tabular-nums">{it.amountCents < 0 ? '−' : ''}{formatPeso(Math.abs(it.amountCents))}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-[color:var(--color-sand-200)] pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatPeso(q.totalCents)}</span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">One-time payment. No subscription. Link valid until well after the event.</p>
              <dl className="mt-3 space-y-1 text-xs text-[color:var(--color-ink-700)]">
                <div className="flex justify-between"><dt>Design</dt><dd>{template?.name ?? '— pick one —'}</dd></div>
                <div className="flex justify-between"><dt>We build it</dt><dd>{modeInfo.turnaround}</dd></div>
                <div className="flex justify-between"><dt>Changes before publishing</dt><dd>{roundsLabel}{rushed && rounds < pkg.revisionRounds ? ' (rushed)' : ''}</dd></div>
              </dl>
            </>
          ) : (
            <p className="text-sm">Pick a package to see the price.</p>
          )}
          {error && <p role="alert" className="mt-3 rounded-xl bg-[#fbe9e7] px-3 py-2 text-sm text-[#8f1d17]">{error}</p>}
          <button type="button" className="btn btn-primary mt-4 w-full" onClick={submit} disabled={pending || !q}>
            {pending ? 'Placing order…' : 'Continue to payment'}
          </button>
          <p className="mt-3 text-center text-xs text-[color:var(--color-ink-500)]">GCash · Maya · Cards · Bank transfer</p>
        </div>
      </aside>
    </div>
  );
}
