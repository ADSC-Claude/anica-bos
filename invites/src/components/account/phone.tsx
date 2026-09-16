'use client';

import { useEffect, useState } from 'react';

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
 */
export function PhonePreview({ src, version }: { src: string; version: number }) {
  const at = (v: number) => `${src}&v=${v}`;
  const [slots, setSlots] = useState<[{ src: string; v: number }, { src: string; v: number }]>([{ src: at(0), v: 0 }, { src: '', v: -1 }]);
  const [front, setFront] = useState<0 | 1>(0);
  useEffect(() => {
    setSlots((s) => {
      if (s[front].v === version) return s;
      const back = front === 0 ? 1 : 0;
      const copy: typeof s = [s[0], s[1]];
      copy[back] = { src: at(version), v: version };
      return copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, front]);
  const arrived = (i: 0 | 1) => {
    if (i !== front && slots[i].v === version) setFront(i);
  };
  return (
    <div className="phone mx-auto">
      {([0, 1] as const).map((i) =>
        slots[i].src ? (
          <iframe key={i} src={slots[i].src} title={i === front ? 'Your page' : 'Loading your page'} onLoad={() => arrived(i)} style={{ visibility: i === front ? 'visible' : 'hidden', zIndex: i === front ? 2 : 1 }} />
        ) : null,
      )}
    </div>
  );
}
