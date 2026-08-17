'use client';

import { useState } from 'react';

export type HeroSlide = {
  /** Set roman. */
  head: string;
  /** Set italic in gilt — the words the eye should land on. */
  tail: string;
  body: string;
};

/**
 * Three faces of the same room.
 *
 * Only the words change; the photograph behind them does not. Swapping the
 * image too would mean either shipping three photographs the spa may not have
 * or cross-fading gradients, and neither earns the weight. What rotates is the
 * reason to come: what we are, when we are open, how little booking costs you.
 */
export function HeroRotator({ slides }: { slides: HeroSlide[] }) {
  const [i, setI] = useState(0);
  const slide = slides[i] ?? slides[0];

  return (
    <>
      <h1 className="font-display text-[2.75rem] leading-[1.02] text-white sm:text-6xl">
        {slide.head}
        {slide.tail && <em className="block italic text-gilt-500">{slide.tail}</em>}
      </h1>
      <p className="mt-6 max-w-xl leading-relaxed text-sand-100">{slide.body}</p>

      {slides.length > 1 && (
        <div role="tablist" aria-label="Featured" className="mt-10 flex gap-6">
          {slides.map((s, n) => (
            <button
              key={s.head}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`${s.head} ${s.tail}`.trim()}
              onClick={() => setI(n)}
              className={`num border-t-2 pt-2.5 text-xs tracking-[0.14em] transition ${
                n === i ? 'border-white text-white' : 'border-white/30 text-white/60'
              } px-5 hover:text-white`}
            >
              {String(n + 1).padStart(2, '0')}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
