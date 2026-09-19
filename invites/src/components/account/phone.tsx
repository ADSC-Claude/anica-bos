'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long to wait for a page to say it has settled before showing it anyway. */
const SETTLE_BY_MS = 2500;

/**
 * The phone, reloaded without a blink. Two frames sit in the bezel; the
 * one in front shows the last save, the one behind loads the next, and
 * they swap only once the new page has arrived — so the customer never
 * watches a blank screen between one save and the next.
 *
 * It lives here rather than in the builder because two tabs now hold one:
 * the Invitation tab beside the form, and the RSVP tab beside the questions.
 * The bezel is the `.phone` frame in globals.css; a `.builder-phone` wrapper
 * around it sizes the frame to a real handset's width.
 *
 * What is on the phone is the address plus the save it is showing, and both
 * move it. The address carries the part being filled in (`?at=`), so moving
 * to another part is as much a reason to reload as saving one: the phone
 * used to watch the save alone, and a customer who stepped from Our Story to
 * the dress code kept the story on screen until she happened to type
 * something.
 *
 * ── Why the frame behind is see-through rather than hidden ──
 *
 * "when the preview shows it rambles, then when you refresh it goes okay."
 *
 * A paged design draws its backgrounds in an effect that measures every page
 * and lays a paper behind each one, and that effect runs on
 * `requestAnimationFrame`. A browser does not run animation frames inside a
 * frame that is `visibility: hidden`. So the page behind loaded, laid out its
 * words — and drew none of its backgrounds; measured mid-swap it had thirteen
 * pages and nought papers. Then it was brought to the front and the papers
 * arrived a frame later, on top of words that had already been read. That is
 * the ramble, and refreshing cured it because a page loaded in a frame that
 * is already in front was never throttled.
 *
 * So the frame behind is `opacity: 0` instead: still a rendered frame, so its
 * animation frames run and it lays itself out fully before anyone sees it.
 * And the swap waits for the page to say it has settled rather than merely
 * that it has loaded — `load` fires before the fonts are ready and before the
 * papers are down. If nothing says so within SETTLE_BY_MS (an older page, or
 * a preview that is not an invitation at all), the swap happens anyway: a
 * phone that never changes is worse than one that changes early.
 */
export function PhonePreview({ src, version }: { src: string; version: number }) {
  const want = `${src}&v=${version}`;
  const [slots, setSlots] = useState<[string, string]>(() => [want, '']);
  const [front, setFront] = useState<0 | 1>(0);
  const frames = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>([null, null]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSlots((s) => {
      if (s[front] === want) return s;
      const back = front === 0 ? 1 : 0;
      const copy: [string, string] = [s[0], s[1]];
      copy[back] = want;
      return copy;
    });
  }, [want, front]);

  const show = useCallback((i: 0 | 1) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setFront((f) => (f === i ? f : i));
  }, []);

  // The page behind says when it is settled. Only the frame we are waiting on
  // is believed, and only from this origin.
  useEffect(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || (e.data as { inv?: string }).inv !== 'settled') return;
      for (const i of [0, 1] as const) {
        if (i !== front && frames.current[i]?.contentWindow === e.source && slots[i] === want) show(i);
      }
    };
    window.addEventListener('message', heard);
    return () => window.removeEventListener('message', heard);
  }, [front, slots, want, show]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Loaded, but not necessarily settled: start the clock rather than swap.
  const arrived = (i: 0 | 1) => {
    if (i === front || slots[i] !== want) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => show(i), SETTLE_BY_MS);
  };

  return (
    <div className="phone mx-auto">
      {([0, 1] as const).map((i) =>
        slots[i] ? (
          <iframe
            key={i}
            ref={(el) => { frames.current[i] = el; }}
            src={slots[i]}
            title={i === front ? 'Your page' : 'Loading your page'}
            onLoad={() => arrived(i)}
            style={{
              opacity: i === front ? 1 : 0,
              pointerEvents: i === front ? undefined : 'none',
              zIndex: i === front ? 2 : 1,
            }}
          />
        ) : null,
      )}
    </div>
  );
}
