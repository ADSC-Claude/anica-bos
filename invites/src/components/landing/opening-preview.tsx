'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { GalleryTemplate } from '@/lib/gallery';
import { PREMIUM_OPENING_CODE, plateChars } from '@/lib/openings';
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
const SAMPLE = { monogram: 'J & M', line: 'You are invited', names: ['Maria', 'Juan'], and: 'and', date: '11 · 21 · 26', line2: '' };
/** Seconds before the clip's end at which the words come up on the card. */
const WORDS_AT = 0.9;
/** How long the card holds with the words before the invitation fades in beneath. */
const HOLD_MS = 2600;
/** How long the invitation's cover shows before the card comes back to rest. */
const COVER_MS = 2400;
/**
 * How long a clip has to get itself playing before the words come up anyway.
 *
 * A preview with no writing on the card is the one thing this must never be,
 * and there are several ordinary ways for a clip not to play: a phone in low
 * power mode refuses autoplay outright, a slow line has not finished the file
 * yet, a browser will not decode it. The guest page has the same guard
 * (LOAD_GRACE_MS in components/invite/client.tsx); this is the preview's.
 */
const LOAD_GRACE_MS = 5000;
/** How long past a clip's expected end the words wait for `ended` before coming up anyway. */
const END_GRACE_MS = 1500;
/** A clip's length when the browser has not said — every clip we ship runs about this long. */
const CLIP_SECONDS = 4;

export function OpeningPreview({ t, priceCents, onClose }: { t: GalleryTemplate; priceCents?: number; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [words, setWords] = useState(false);
  const [cover, setCover] = useState(false);
  // The clip never ran, so the words are going on a card of the design's own
  // colours rather than over a poster that carries its own writing.
  const [still, setStill] = useState(false);
  // Bumped by Play again, which starts the whole sequence over.
  const [run, setRun] = useState(0);
  // Whether the words are up, for the watcher below to read without restarting it.
  const shown = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  /**
   * The clip plays — and if it will not, the words come up anyway.
   *
   * A phone in low power mode refuses autoplay outright, a slow line has not
   * finished the file, a browser will not decode it: in every one of those the
   * old preview sat on the poster and never showed a word, which is what this
   * is here to prevent. A clip that never starts hands the words to the
   * design's own card; one that starts but never reports its end gets its
   * length plus a grace, then the words come up regardless.
   */
  useEffect(() => {
    setWords(false);
    setCover(false);
    setStill(false);
    shown.current = false;
    // The words go on the design's own card, at once and with no clip: a
    // visitor who has asked for less movement is not made to wait through one.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setStill(true);
      setWords(true);
      return;
    }
    const v = video.current;
    // A clip already in the error state will not play again, so Play again
    // goes straight to the card rather than sitting through the grace.
    if (v?.error) {
      setStill(true);
      setWords(true);
      return;
    }
    if (v) {
      try {
        v.currentTime = 0;
      } catch {
        // nothing loaded yet: it starts from the top anyway
      }
      // a refused autoplay — a phone in low power mode does refuse — is the
      // same as a clip that will not play: the words come up on the card
      void v.play().catch(() => {
        setStill(true);
        setWords(true);
      });
    }
    const opened = performance.now();
    // when the clip was first seen running, so a clip that starts late is
    // still given its whole length before the words go on without it
    let began = 0;
    const id = window.setInterval(() => {
      if (shown.current) {
        window.clearInterval(id);
        return;
      }
      const el = video.current;
      const now = performance.now();
      const running = el ? el.currentTime > 0.1 : false;
      if (running && !began) began = now;
      const length = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : CLIP_SECONDS;
      if (!running && now - opened > LOAD_GRACE_MS) {
        setStill(true);
        setWords(true);
        window.clearInterval(id);
      } else if (running && now - began > length * 1000 + END_GRACE_MS) {
        setWords(true);
        window.clearInterval(id);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [run]);
  /**
   * Once the words are up they hold, the invitation's cover fades in beneath
   * them as a guest gets it, and then the card comes back — and stays. The
   * writing is what the visitor opened this to read, so it is where the
   * preview rests rather than a beat they have to catch.
   */
  useEffect(() => {
    shown.current = words;
    if (!words) return;
    const on = window.setTimeout(() => setCover(true), HOLD_MS);
    const off = window.setTimeout(() => setCover(false), HOLD_MS + COVER_MS);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [words]);
  const replay = () => setRun((r) => r + 1);
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
        <div className="gal-phone" style={t.vars as CSSProperties} data-cover={cover} data-still={still} data-clip={t.clip?.key ?? ''}>
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
            onEnded={() => setWords(true)}
            onError={() => {
              setStill(true);
              setWords(true);
            }}
          />
          {/* the card the words go on when the clip could not play */}
          <div className="gal-still" data-show={still} aria-hidden />
          <div className="gal-plate" data-show={words} aria-hidden>
            <div>
              {card.monogram && <p className="inv-plate-mono">{card.monogram}</p>}
              <p className="inv-plate-eyebrow">{card.line}</p>
              <p className="inv-plate-names" style={{ ['--plate-chars' as string]: plateChars(card.names) }}>
                {card.names.map((n, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="inv-plate-and">{card.and}</span>}
                    {n}
                  </Fragment>
                ))}
              </p>
              {card.date && <p className="inv-plate-date">{card.date}</p>}
              {card.line2 && <p className="inv-plate-line2">{card.line2}</p>}
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
