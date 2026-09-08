'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { GalleryTemplate } from '@/lib/gallery';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { formatPesoShort } from '@/lib/money';

/**
 * The premium opening, previewed the way a guest gets it: the clip in a
 * phone, the design's demo's words coming up on the card as it settles, a
 * hold to read them, and the design's cover fading in beneath. The timings
 * are the invitation's own (components/invite/client.tsx), and the words are
 * set by the same function the guest page uses (plateWords), from the demo's
 * form — so what the couple watches here is what their guests will see, with
 * their names in place of the demo's. A design with no demo yet shows this
 * stock sample.
 */
const SAMPLE = { monogram: 'J & M', line: 'You are invited', names: ['Maria', 'Juan'], and: 'and', date: '11 · 21 · 26' };
/** Seconds before the clip's end at which the words come up on the card. */
const WORDS_AT = 0.9;
/** How long the card holds with the words before the cover fades in. */
const HOLD_MS = 1800;

export function OpeningPreview({ t, priceCents, onClose }: { t: GalleryTemplate; priceCents?: number; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [words, setWords] = useState(false);
  const [cover, setCover] = useState(false);
  useEffect(() => {
    void video.current?.play().catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  const replay = () => {
    setWords(false);
    setCover(false);
    const v = video.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  };
  const checkout = `/checkout?occasion=${t.occasion}&template=${t.id}${t.premium ? '&tier=COMPLETE' : ''}&addon=${PREMIUM_OPENING_CODE}`;
  const card = t.sample ?? SAMPLE;
  const blurb = t.clip?.blurb ?? 'the card opens with your names and date set on it, and your invitation fades in beneath';
  return createPortal(
    <div className="gal-preview" role="dialog" aria-modal="true" aria-label={`The premium opening of ${t.name}`} onClick={onClose}>
      {/* the cross in the corner: the way out of a snippet, in reach the whole time */}
      <button type="button" className="gal-close" onClick={onClose} aria-label={`Close the preview of ${t.name}`} title="Close">×</button>
      <div className="gal-preview-body" onClick={(e) => e.stopPropagation()}>
        {/* the design's own faces, so the sample words are set the way the couple's will be */}
        <link rel="stylesheet" href={t.fontsUrl} precedence="default" />
        <div className="gal-phone" style={t.vars as CSSProperties} data-cover={cover} data-clip={t.clip?.key ?? ''}>
          <video
            ref={video}
            src={t.openingVideoUrl}
            poster={t.openingPosterUrl}
            className="gal-clip"
            muted
            playsInline
            preload="auto"
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration && v.duration - v.currentTime <= WORDS_AT) setWords(true);
            }}
            onEnded={() => {
              setWords(true);
              window.setTimeout(() => setCover(true), HOLD_MS);
            }}
          />
          <div className="gal-plate" data-show={words} aria-hidden>
            <div>
              {card.monogram && <p className="inv-plate-mono">{card.monogram}</p>}
              <p className="inv-plate-eyebrow">{card.line}</p>
              <p className="inv-plate-names">
                {card.names.map((n, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="inv-plate-and">{card.and}</span>}
                    {n}
                  </Fragment>
                ))}
              </p>
              {card.date && <p className="inv-plate-date">{card.date}</p>}
            </div>
          </div>
          {t.thumbnailUrl && <img src={t.thumbnailUrl} alt={`The cover of ${t.name}`} className="gal-cover" data-show={cover} />}
        </div>
        <div className="gal-preview-side">
          <p className="eyebrow">Premium opening · add-on{priceCents ? ` · +${formatPesoShort(priceCents)}` : ''}</p>
          <h3 className="display mt-1 text-2xl">{t.name}</h3>
          <p className="mt-2 text-sm opacity-90">
            As your guest sees it: {blurb}. The words here are the design&apos;s sample — yours go on the card.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={replay}>Play again</button>
            <Link href={checkout} className="btn btn-primary btn-sm">Choose it with the premium opening</Link>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
