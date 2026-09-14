'use client';

import { useEffect } from 'react';

/**
 * Brings one part of the page into view once it has laid out — for the
 * builder's phone, which reloads after every save and should come back to
 * the part being edited rather than to the top. A paged design lays its
 * grounds in an effect that measures each page, so the scroll is tried
 * again once that has had time to settle; a page that never had the anchor
 * (a part left empty, which does not render) simply stays where it is.
 */
export function ScrollTo({ id }: { id: string }) {
  useEffect(() => {
    if (!id) return;
    // The page's own window and nothing above it. scrollIntoView reaches up
    // through a same-origin frame and scrolls the dashboard too, so the
    // builder's phone dragged the Invitation tab down past the Get-started
    // list — and the welcome — on every open.
    const go = () => {
      const el = document.getElementById(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY });
    };
    const t1 = setTimeout(go, 80);
    const t2 = setTimeout(go, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [id]);
  return null;
}
