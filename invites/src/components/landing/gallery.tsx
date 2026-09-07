'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Tier } from '@prisma/client';
import { OCCASIONS } from '@/lib/occasions';
import type { GalleryTemplate } from '@/lib/gallery';
import { TIERS, TIER_LABELS } from '@/lib/tiers';
import { collectionsPresent, COLLECTION_BY_KEY } from '@/lib/collections';
import { openingName } from '@/lib/openings';

export type { GalleryTemplate };

export function TemplateGallery({ templates, compact = false, collection: fixedCollection }: { templates: GalleryTemplate[]; compact?: boolean; collection?: string }) {
  const [occasion, setOccasion] = useState<string>('');
  const [tier, setTier] = useState<string>('');
  // A gallery already scoped to one collection (the collection page) hides the
  // collection buttons — there is nothing to switch to.
  const [collection, setCollection] = useState<string>('');
  const occasionsPresent = OCCASIONS.filter((o) => templates.some((t) => t.occasion === o.key));
  const collections = fixedCollection ? [] : collectionsPresent(templates.map((t) => t.collection));
  const rank: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2 };
  const visible = templates.filter(
    (t) =>
      (!occasion || t.occasion === occasion) &&
      (!collection || t.collection === collection) &&
      (!tier || (t.premium ? tier === 'COMPLETE' : rank[t.minTier] <= rank[tier as Tier])),
  );
  const shown = compact ? visible.slice(0, 8) : visible;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setOccasion('')} className={`btn btn-sm ${occasion === '' ? 'btn-primary' : 'btn-secondary'}`}>All occasions</button>
          {occasionsPresent.map((o) => <button key={o.key} type="button" onClick={() => setOccasion(o.key)} className={`btn btn-sm ${occasion === o.key ? 'btn-primary' : 'btn-secondary'}`}>{o.label}</button>)}
        </div>
        {collections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setCollection('')} className={`btn btn-sm ${collection === '' ? 'btn-primary' : 'btn-secondary'}`}>All colours</button>
            {collections.map((c) => (
              <button key={c.key} type="button" onClick={() => setCollection(c.key)} className={`btn btn-sm ${collection === c.key ? 'btn-primary' : 'btn-secondary'}`}>
                <span className="mr-1 inline-flex align-middle">{c.swatch.map((hex) => <span key={hex} className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: hex }} />)}</span>
                {c.label.replace(/^The | Collection$/g, '')}
              </button>
            ))}
          </div>
        )}
        <select className="field max-w-[12rem]" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by package">
          <option value="">Any package</option>
          {TIERS.map((t) => <option key={t} value={t}>Included in {TIER_LABELS[t]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {shown.map((t) => (
          <article key={t.id} className="card group overflow-hidden">
            <OpeningCard t={t} />
            <div className="p-3">
              <p className="text-sm font-semibold">{t.name} {t.featured && <span className="pill pill-info">Popular</span>}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">{OCCASIONS.find((o) => o.key === t.occasion)?.label} · {t.premium ? 'Premium · Complete' : t.minTier === 'BASIC' ? 'Basic & up' : `${TIER_LABELS[t.minTier]} & up`}</p>
              <TemplateNote collection={t.collection} opening={t.opening} name={t.name} />
              <Link href={`/checkout?occasion=${t.occasion}&template=${t.id}${t.premium ? '&tier=COMPLETE' : ''}`} className="btn btn-primary btn-sm mt-3 w-full">Choose this design</Link>
            </div>
          </article>
        ))}
        {shown.length === 0 && <p className="col-span-full text-sm text-[color:var(--color-ink-500)]">No designs yet for that filter — message us and we will build one.</p>}
      </div>
      {compact && visible.length > 8 && <p className="mt-4 text-center"><Link href="/templates" className="btn btn-secondary">See all {visible.length} designs</Link></p>}
    </div>
  );
}

/**
 * What the public sees of a design: its opening, and only its opening. The
 * card is the clip's own still with a play button; a tap plays the clip in
 * place, sound and all, since the tap is the gesture that allows it. A design
 * with no clip yet shows its name on its palette. The invitation itself is
 * never on the card — it is unveiled for the customer after they choose.
 */
function OpeningCard({ t }: { t: GalleryTemplate }) {
  const [playing, setPlaying] = useState(false);
  const clip = Boolean(t.openingVideoUrl && t.openingPosterUrl);
  if (!clip) {
    return (
      <div className="relative aspect-[9/16] overflow-hidden" style={{ background: `linear-gradient(160deg, ${t.palette.bg} 0%, ${t.palette.accent2} 100%)` }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: t.palette.ink }}>{OCCASIONS.find((o) => o.key === t.occasion)?.label}</span>
          <span className="display mt-2 text-2xl" style={{ color: t.palette.accent }}>{t.name}</span>
          <span className="mt-2 flex gap-1">{[t.palette.bg, t.palette.accent, t.palette.accent2].map((c) => <span key={c} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />)}</span>
          <span className="mt-4 text-[10px] uppercase tracking-[0.2em]" style={{ color: t.palette.ink }}>Opening coming soon</span>
        </div>
      </div>
    );
  }
  return (
    <div className="relative aspect-[9/16] overflow-hidden bg-black">
      {playing ? (
        <video src={t.openingVideoUrl} poster={t.openingPosterUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay playsInline controls onEnded={() => setPlaying(false)} />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group/play absolute inset-0 block h-full w-full" aria-label={`Watch the opening of ${t.name}`}>
          <img src={t.openingPosterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/15 text-white transition group-hover/play:bg-black/30">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="text-[10px] uppercase tracking-[0.3em] drop-shadow">Watch the opening</span>
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * The second line on a card: the collection, and what the design opens with.
 * A design named after its opening — The Drape opens with The Drape — says it
 * once, not twice.
 */
function TemplateNote({ collection, opening, name }: { collection: string; opening: string; name: string }) {
  const label = collection ? COLLECTION_BY_KEY[collection]?.label ?? '' : '';
  const opens = opening && !name.includes(openingName(opening)) ? `Opens with ${openingName(opening)}` : '';
  if (!label && !opens) return null;
  return (
    <p className="mt-0.5 text-xs text-[color:var(--color-ink-500)]">
      {[label, opens].filter(Boolean).join(' · ')}
    </p>
  );
}
