'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Occasion, ServiceMode, Tier } from '@prisma/client';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS, TIER_LABELS, COMPARISON } from '@/lib/tiers';
import { SERVICE_MODES, quote, type CouponLike } from '@/lib/pricing';
import { formatPesoShort, formatPeso } from '@/lib/money';
import { placeOrderAction, checkCouponAction } from './actions';
import { invitationPath } from '@/lib/app-url';

export type WizardPackage = { code: string; name: string; tagline: string; occasion: Occasion | null; tier: Tier; priceCents: number; dfyFeeCents: number; conciergeFeeCents: number };
export type WizardAddOn = { code: string; name: string; description: string; priceCents: number; quoted: boolean };
export type WizardTemplate = { id: string; slug: string; name: string; occasion: Occasion; minTier: Tier; premium: boolean; thumbnailUrl: string; description: string; palette: { bg: string; accent: string; accent2: string } };

export type WizardProps = {
  packages: WizardPackage[];
  addOns: WizardAddOn[];
  templates: WizardTemplate[];
  initial: { occasion?: string; tier?: string; mode?: string; template?: string; coupon?: string };
  demoSlug: string;
};

const RANK: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2 };

export function CheckoutWizard(p: WizardProps) {
  const [occasion, setOccasion] = useState<Occasion>((OCCASIONS.some((o) => o.key === p.initial.occasion) ? p.initial.occasion : 'WEDDING') as Occasion);
  const [tier, setTier] = useState<Tier>((TIERS.includes(p.initial.tier as Tier) ? p.initial.tier : 'STANDARD') as Tier);
  const [mode, setMode] = useState<ServiceMode>((['DIY', 'DFY', 'CONCIERGE'].includes(p.initial.mode ?? '') ? p.initial.mode : 'DIY') as ServiceMode);
  const [templateId, setTemplateId] = useState<string>(p.initial.template ?? '');
  const [addOns, setAddOns] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState(p.initial.coupon ?? '');
  const [coupon, setCoupon] = useState<CouponLike | null>(null);
  const [couponError, setCouponError] = useState('');
  const [language, setLanguage] = useState<'en' | 'tl'>('en');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const pkg = useMemo(() => p.packages.find((x) => x.occasion === occasion && x.tier === tier) ?? p.packages.find((x) => x.occasion === null && x.tier === tier), [p.packages, occasion, tier]);
  const chosenAddOns = p.addOns.filter((a) => addOns.includes(a.code) && a.quoted);
  const q = useMemo(() => (pkg ? quote({ pkg, serviceMode: mode, addOns: chosenAddOns, coupon: coupon ?? undefined }) : null), [pkg, mode, chosenAddOns, coupon]);

  const templates = p.templates.filter((t) => t.occasion === occasion && (tier === 'COMPLETE' || !t.premium) && (tier !== 'BASIC' || t.minTier === 'BASIC'));
  const template = templates.find((t) => t.id === templateId) ?? null;
  const modeInfo = SERVICE_MODES.find((m) => m.key === mode)!;

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
      const res = await placeOrderAction({ occasion, tier, serviceMode: mode, templateId: template.id, addOnCodes: addOns, couponCode: coupon?.code, language, notes });
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

        {/* 3 — service mode */}
        <section>
          <h2 className="display mb-3 text-xl">3. Who fills in the details?</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SERVICE_MODES.map((m) => {
              const fee = pkg ? (m.key === 'DFY' ? pkg.dfyFeeCents : m.key === 'CONCIERGE' ? pkg.conciergeFeeCents : 0) : 0;
              return (
                <button key={m.key} type="button" onClick={() => setMode(m.key)} className={`card p-4 text-left ${mode === m.key ? 'border-[color:var(--color-plum-600)] ring-2 ring-[color:var(--color-plum-600)]' : ''}`} aria-pressed={mode === m.key}>
                  <span className="block font-semibold">{m.label}</span>
                  <span className="block text-sm text-[color:var(--color-ink-700)]">{fee ? `+ ${formatPesoShort(fee)}` : 'Included'}</span>
                  <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{m.blurb}</span>
                  <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">Turnaround: {m.turnaround} · Revisions: {m.revisions}</span>
                </button>
              );
            })}
          </div>
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
                  <div className="aspect-[4/5] w-full" style={{ background: tp.thumbnailUrl ? `center/cover url(${tp.thumbnailUrl})` : `linear-gradient(160deg, ${tp.palette.bg}, ${tp.palette.accent2})` }}>
                    {!tp.thumbnailUrl && <div className="flex h-full items-end p-3"><span className="display text-lg" style={{ color: tp.palette.accent }}>{tp.name}</span></div>}
                  </div>
                  <div className="p-2">
                    <span className="block text-sm font-semibold">{tp.name}</span>
                    <span className="block text-xs text-[color:var(--color-ink-500)]">{tp.premium ? 'Premium · Complete' : tp.minTier === 'BASIC' ? 'Basic set' : 'Standard & up'}</span>
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
            {p.addOns.map((a) => (
              <label key={a.code} className={`card flex items-start gap-3 p-3 ${!a.quoted ? 'opacity-70' : ''}`}>
                <input type="checkbox" className="mt-1 h-4 w-4" disabled={!a.quoted} checked={addOns.includes(a.code)} onChange={(e) => setAddOns((s) => (e.target.checked ? [...s, a.code] : s.filter((c) => c !== a.code)))} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{a.name}</span>
                  <span className="block text-xs text-[color:var(--color-ink-500)]">{a.description}</span>
                </span>
                <span className="text-sm font-semibold">{a.quoted ? formatPesoShort(a.priceCents) : 'Ask us'}</span>
              </label>
            ))}
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
                <div className="flex justify-between"><dt>Service</dt><dd>{modeInfo.label}</dd></div>
                <div className="flex justify-between"><dt>Turnaround</dt><dd>{modeInfo.turnaround}</dd></div>
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
