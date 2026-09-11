'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Occasion, Tier } from '@prisma/client';
import { OCCASIONS } from '@/lib/occasions';
import type { GalleryTemplate } from '@/lib/gallery';
import { TIERS, TIER_LABELS, RANK, tierAtLeast } from '@/lib/tiers';
import { collectionsPresent, COLLECTION_BY_KEY } from '@/lib/collections';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { formatPesoShort } from '@/lib/money';
import { OpeningPreview } from './opening-preview';

export type { GalleryTemplate };

/** "Signature only" for a design kept out of Basic and Standard; otherwise the lowest package it comes in. */
export function packageLine(t: { premium: boolean; minTier: Tier }): string {
  return t.premium ? `${TIER_LABELS.COMPLETE} only` : t.minTier === 'BASIC' ? 'Basic & up' : `${TIER_LABELS[t.minTier]} & up`;
}

/**
 * "Wedding", or "Wedding · Anniversary", or "Anniversary +2 more": every
 * occasion a design is offered for, kept to one short line, and led by the
 * occasion being browsed so a visitor on the anniversary page reads
 * "Anniversary" first.
 */
function occasionsLine(t: GalleryTemplate, first?: string): string {
  const keys = first && t.occasions.includes(first as Occasion) ? [first, ...t.occasions.filter((k) => k !== first)] : t.occasions;
  const labels = keys.map((k) => OCCASIONS.find((o) => o.key === k)?.label ?? k);
  return labels.length <= 2 ? labels.join(' · ') : `${labels[0]} +${labels.length - 1} more`;
}

export function TemplateGallery({ templates, compact = false, collection: fixedCollection, occasion: fixedOccasion, premiumPriceCents }: {
  templates: GalleryTemplate[];
  compact?: boolean;
  collection?: string;
  /** A gallery already scoped to one occasion (the occasion page) hides the occasion buttons and links the checkout to it. */
  occasion?: Occasion;
  /** The premium opening add-on's price, for the line on a design that has one. */
  premiumPriceCents?: number;
}) {
  const [occasion, setOccasion] = useState<string>(fixedOccasion ?? '');
  const [tier, setTier] = useState<string>('');
  // A gallery already scoped to one collection (the collection page) hides the
  // collection buttons — there is nothing to switch to.
  const [collection, setCollection] = useState<string>('');
  const occasionsPresent = fixedOccasion ? [] : OCCASIONS.filter((o) => templates.some((t) => t.occasions.includes(o.key)));
  const collections = fixedCollection ? [] : collectionsPresent(templates.map((t) => t.collection));
  const visible = templates.filter(
    (t) =>
      (!occasion || t.occasions.includes(occasion as Occasion)) &&
      (!collection || t.collection === collection) &&
      (!tier || (t.premium ? tierAtLeast(tier as Tier, 'COMPLETE') : RANK[t.minTier] <= RANK[tier as Tier])),
  );
  const shown = compact ? visible.slice(0, 8) : visible;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {!fixedOccasion && (
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setOccasion('')} className={`btn btn-sm ${occasion === '' ? 'btn-primary' : 'btn-secondary'}`}>All occasions</button>
          {occasionsPresent.map((o) => <button key={o.key} type="button" onClick={() => setOccasion(o.key)} className={`btn btn-sm ${occasion === o.key ? 'btn-primary' : 'btn-secondary'}`}>{o.label}</button>)}
        </div>
        )}
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
        {shown.map((t) => {
          // the checkout opens on the occasion being browsed, else the design's home one
          const occ = (occasion || t.occasion) as Occasion;
          return (
          <article key={t.id} className="card group overflow-hidden">
            <CoverCard t={t} premiumPriceCents={premiumPriceCents} />
            <div className="p-3">
              <p className="text-sm font-semibold">{t.name} {t.featured && <span className="pill pill-info">Popular</span>}</p>
              <p className="text-xs text-[color:var(--color-ink-500)]">{occasionsLine(t, occasion)} · {packageLine(t)}</p>
              <TemplateNote t={t} premiumPriceCents={premiumPriceCents} />
              {t.peekSlug && (
                <Link href={`/${t.peekSlug}?peek=1`} className="mt-2 block text-center text-xs text-[color:var(--color-plum-600)] underline">See it open, to Our Story</Link>
              )}
              <Link href={`/checkout?occasion=${occ}&template=${t.id}${t.premium ? '&tier=COMPLETE' : ''}`} className="btn btn-primary btn-sm mt-3 w-full">Choose this design</Link>
              {hasClip(t) && (
                <Link href={`/checkout?occasion=${occ}&template=${t.id}${t.premium ? '&tier=COMPLETE' : ''}&addon=${PREMIUM_OPENING_CODE}`} className="mt-1.5 block text-center text-xs text-[color:var(--color-ink-500)] underline">
                  Choose it with the premium opening
                </Link>
              )}
            </div>
          </article>
          );
        })}
        {shown.length === 0 && <p className="col-span-full text-sm text-[color:var(--color-ink-500)]">No designs yet for that filter — message us and we will build one.</p>}
      </div>
      {compact && visible.length > 8 && <p className="mt-4 text-center"><Link href="/templates" className="btn btn-secondary">See all {visible.length} designs</Link></p>}
    </div>
  );
}

/** A design with a premium opening clip of its own to sell. */
function hasClip(t: GalleryTemplate): boolean {
  return Boolean(t.openingVideoUrl && t.openingPosterUrl);
}

/**
 * What the public sees of a design: its cover page — the first page a guest
 * lands on, the shape of a phone, so the card reads as the invitation and not
 * as a square swatch. The pages under the cover are unveiled for the customer
 * after they choose. A design that has a premium opening clip carries a small
 * pill on the cover; a tap opens the preview — the clip at phone size with
 * the sample words on the card and the cover fading in, as a guest gets it.
 * A design with no cover image yet shows its name on its palette.
 */
function CoverCard({ t, premiumPriceCents }: { t: GalleryTemplate; premiumPriceCents?: number }) {
  const [preview, setPreview] = useState(false);
  const clip = hasClip(t);
  return (
    <div className="relative aspect-[9/16] overflow-hidden" style={{ background: `linear-gradient(160deg, ${t.palette.bg} 0%, ${t.palette.accent2} 100%)` }}>
      {t.thumbnailUrl ? (
        <img src={t.thumbnailUrl} alt={`The cover of ${t.name}`} className="absolute inset-0 h-full w-full object-cover object-top" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
          <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: t.palette.ink }}>{OCCASIONS.find((o) => o.key === t.occasion)?.label}</span>
          <span className="display mt-2 text-2xl" style={{ color: t.palette.accent }}>{t.name}</span>
          <span className="mt-2 flex gap-1">{[t.palette.bg, t.palette.accent, t.palette.accent2].map((c) => <span key={c} className="h-3 w-3 rounded-full border border-black/10" style={{ background: c }} />)}</span>
          <span className="mt-4 text-[10px] uppercase tracking-[0.2em]" style={{ color: t.palette.ink }}>Cover coming soon</span>
        </div>
      )}
      {clip && (
        <button type="button" onClick={() => setPreview(true)} className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white shadow backdrop-blur transition hover:bg-black/75" aria-label={`Watch the premium opening of ${t.name}`}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
          Premium opening
        </button>
      )}
      {preview && clip && <OpeningPreview t={t} priceCents={premiumPriceCents} onClose={() => setPreview(false)} />}
    </div>
  );
}

/**
 * The second line on a card: the collection, and the premium opening add-on
 * when the design has a clip of its own — with its price when the page knows
 * it. The opening every package includes is not news, so it is not said here.
 */
function TemplateNote({ t, premiumPriceCents }: { t: GalleryTemplate; premiumPriceCents?: number }) {
  const label = t.collection ? COLLECTION_BY_KEY[t.collection]?.label ?? '' : '';
  const premium = hasClip(t) ? (premiumPriceCents ? `Premium opening add-on · +${formatPesoShort(premiumPriceCents)}` : 'Premium opening add-on') : '';
  if (!label && !premium) return null;
  return (
    <p className="mt-0.5 text-xs text-[color:var(--color-ink-500)]">
      {[label, premium].filter(Boolean).join(' · ')}
    </p>
  );
}
