'use client';

import { useState } from 'react';

/**
 * The phone on the landing page plays the flagship design's premium opening —
 * the add-on, and the best thing on the site to watch — from its own still, on a tap. The tap is
 * the gesture that lets it play with sound on a phone. The invitation under
 * the opening is not here: it is unveiled for the customer after they choose.
 */
export function PhoneOpening({ src, poster, name }: { src: string; poster: string; name: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="phone mx-auto">
      <div className="screen overflow-hidden bg-black">
        {playing ? (
          <video src={src} poster={poster} autoPlay playsInline controls onEnded={() => setPlaying(false)} className="h-full w-full object-cover" />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} className="relative block h-full w-full" aria-label={`Watch the premium opening of ${name}`}>
            <img src={poster} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-black/55 via-black/20 to-black/10 text-white">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] drop-shadow">Tap to watch the premium opening</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
