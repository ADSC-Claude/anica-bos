'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Occasion, Tier } from '@prisma/client';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS, TIER_LABELS } from '@/lib/tiers';

export type GalleryTemplate = { id: string; slug: string; name: string; occasion: Occasion; minTier: Tier; premium: boolean; description: string; thumbnailUrl: string; layout: string; palette: { bg: string; accent: string; accent2: string; ink: string }; featured: boolean };

export function TemplateGallery({ templates, demoSlug, compact = false }: { templates: GalleryTemplate[]; demoSlug: string; compact?: boolean }) {
  const [occasion, setOccasion] = useState<string>('');
  const [tier, setTier] = useState<string>('');
  const occasionsPresent = OCCASIONS.filter((o) => templates.some((t) => t.occasion === o.key));
  const rank: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2 };
  const visible = templates.filter((t) => (!occasion || t.occasion === occasion) && (!tier || (t.premium ? tier === 'COMPLETE' : rank[t.minTier] <= rank[tier as Tier])));
  const shown = compact ? visible.slice(0, 8) : visible;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setOccasion('')} className={`btn btn-sm ${occasion === '' ? 'btn-primary' : 'btn-secondary'}`}>All occasions</button>
          {occasionsPresent.map((o) => <button key={o.key} type="button" onClick={() => setOccasion(o.key)} className={`btn btn-sm ${occasion === o.key ? 'btn-primary' : 'btn-secondary'}`}>{o.label}</button>)}
        </div>
        <select className="field max-w-[12rem]" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by package">
          <option value="">Any package</option>
          {TIERS.map((t) => <option key={t} value={t}>Included in {TIER_LABELS[t]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {shown.map((t) => (
          <article key={t.id} className="card group overflow-hidden">
            <div className="relative aspect-[4/5]" style={{ background: t.thumbnailUrl ? `center/cover url(${t.thumbnailUrl})` : `linear-gradient(160deg, ${t.palette.bg} 0%, ${t.palette.accent2} 100%)` }}>
              {!t.thumbnailUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                  <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: t.palette.ink }}>{OCCASIONS.find((o) => o.key === t.occasion)?.label}</span>
                  <span className="display mt-2 text-2xl" style={{ color: t.palette.accent }}>{t.name}</span>
                  <span className="mt-2 flex gap-1">{[t.palette.bg, t.palette.accent, t.palette.accent2].map((c) => <span key={c} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />)}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex translate-y-full gap-2 bg-black/60 p-2 transition group-hover:translate-y-0 group-focus-within:translate-y-0">
                <Link href={`/checkout?occasion=${t.occasion}&template=${t.id}${t.premium ? '&tier=COMPLETE' : ''}`} className="btn btn-primary btn-sm flex-1">Try this template</Link>
                {t.occasion === 'WEDDING' && <a href={`/i/${demoSlug}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Demo</a>}
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold">{t.name} {t.featured && <span className="pill pill-info">Popular</span>}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">{OCCASIONS.find((o) => o.key === t.occasion)?.label} · {t.premium ? 'Premium · Complete' : t.minTier === 'BASIC' ? 'Basic & up' : `${TIER_LABELS[t.minTier]} & up`}</p>
            </div>
          </article>
        ))}
        {shown.length === 0 && <p className="col-span-full text-sm text-[color:var(--color-ink-500)]">No designs yet for that filter — message us and we will build one.</p>}
      </div>
      {compact && visible.length > 8 && <p className="mt-4 text-center"><Link href="/templates" className="btn btn-secondary">See all {visible.length} designs</Link></p>}
    </div>
  );
}
