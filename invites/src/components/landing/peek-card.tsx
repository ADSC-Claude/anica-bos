'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The maroon band's picture, alive.
 *
 * It used to be a still of a cover, which is a strange thing for this section
 * to say: the sentence beside it promises an invitation that opens, and the
 * picture was the one part of the page that could not. So the slot now holds
 * the design's own peek — the same snippet the gallery links to, `?peek=1`,
 * which plays the opening and stops after Our Story — running in place.
 *
 * **Why the frame is left interactive, and why that is safe.** An embedded
 * page that scrolls normally sets a trap: a wheel or a thumb over it scrolls
 * the embed rather than the page, and a visitor who only meant to reach the
 * next section is stuck fighting it. This one cannot spring that trap early,
 * because the invitation holds its own scroll shut while the opening is up
 * (`document.body.style.overflow` in components/invite/client.tsx) — so until
 * somebody deliberately taps the seal, every scroll over this card belongs to
 * the landing page. After the tap they have asked for the invitation, and the
 * peek is three screens long, so the inner scroll reaches its end and chains
 * back out rather than holding on.
 *
 * That tap is the invitation's, not ours, and it is not forwarded from here.
 * It is the gesture that lets the opening's clip and music play at all —
 * browsers grant that to a real tap inside the frame, and not to a synthetic
 * one dispatched from the parent — so a card that opened itself would be a
 * card that showed the premium opening silent and still, which is the one
 * thing this section exists to avoid.
 */
export function PeekCard({
  slug,
  still,
  name,
  className = '',
}: {
  /** The demo to peek — a `Template.demoSlug`, the only slug `?peek=1` opens. */
  slug: string;
  /** The cover, painted at once and left underneath the frame that loads over it. */
  still: string;
  /** The design's name, for the frame's title and the way in. */
  name: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);
  const [open, setOpen] = useState(false);

  /**
   * The frame arrives when the band does.
   *
   * Loading it on view rather than on paint is not only the cheaper choice —
   * it is the better-timed one. The opening is a thing to be watched, and it
   * should be on screen when it plays rather than minutes earlier.
   *
   * A visitor who has asked for less movement keeps the still and is given the
   * way in below instead; nothing loads and starts moving at them.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof IntersectionObserver === 'undefined') {
      setLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLoad(true);
          io.disconnect();
        }
      },
      // a little before it arrives, so it has painted by the time it is looked at
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className={`ed-peek ${className}`.trim()} data-open={open ? '' : undefined}>
      {/* Decorative: the frame over it carries the same invitation, named. */}
      <img src={still} alt="" className="ed-peek-still" />
      {load && (
        <iframe
          // `embed` drops the peek's corner controls and sends the two links at
          // its end to the whole window — see RenderProps in invite/renderer.
          src={`/${slug}?peek=1&embed=1`}
          title={`${name}, from its opening to Our Story`}
          className="ed-peek-frame"
          onLoad={() => setOpen(true)}
        />
      )}
      {/* Before it loads — a visitor who asked for less motion, or one who got
          here before the band did — the whole picture is the way in. Nothing
          covers the invitation once it is running: it says "tap to open"
          itself, and a badge of ours on top of its own words is one label too
          many on a card this size. */}
      {!load && (
        <button type="button" className="ed-peek-wake" onClick={() => setLoad(true)}>
          <span className="ed-peek-label">Open {name}</span>
        </button>
      )}
    </div>
  );
}
