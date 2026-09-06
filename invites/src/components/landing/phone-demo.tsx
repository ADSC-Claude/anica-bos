'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The phone on the landing page shows the real demo invitation in an iframe
 * and slowly scrolls it, pausing while the visitor is touching or hovering.
 * Same-origin, so scrolling the frame's document is allowed.
 */
export function PhoneDemo({ src }: { src: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let dir = 1;
    const id = setInterval(() => {
      if (paused) return;
      const win = frame.current?.contentWindow;
      const doc = frame.current?.contentDocument;
      if (!win || !doc) return;
      const max = doc.documentElement.scrollHeight - win.innerHeight;
      if (max <= 0) return;
      const y = win.scrollY + dir * 1.2;
      if (y >= max) dir = -1;
      if (y <= 0) dir = 1;
      win.scrollTo(0, y);
    }, 40);
    return () => clearInterval(id);
  }, [paused]);
  return (
    <div className="phone mx-auto" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}>
      <iframe ref={frame} src={src} title="Demo invitation" loading="lazy" />
    </div>
  );
}
