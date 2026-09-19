'use client';

import { useEffect } from 'react';

/**
 * Brings one part of the page into view once it has laid out — for the
 * builder's phone, which reloads after every save and whenever the customer
 * moves to another part, and should come back to the part being edited
 * rather than to the top. A paged design lays its grounds in an effect that
 * measures each page, so the scroll is tried again once that has had time to
 * settle; a page that never had the anchor (a part left empty, which does not
 * render) simply stays where it is.
 */
export function ScrollTo({ id, page }: {
  id: string;
  /**
   * The design's own page for this part, where it draws one.
   *
   * A drawn page's id is the page's key, and only a `live` page also prints
   * the section's own markup with the section's id on it. So Our Story is
   * `#our-story` and the gift note is `#gift-note`, and looking for `#story`
   * and `#gift` found nothing at all — the preview sat on the cover while
   * she filled in the story. The section's own id is still tried first: it
   * is the more exact place on a page that carries two parts.
   */
  page?: string;
}) {
  useEffect(() => {
    if (!id && !page) return;
    const go = () => {
      const el = document.getElementById(id) ?? (page ? document.getElementById(page) : null);
      if (!el) return;
      /*
       * A page behind the hub lives in a closed booklet, which is display:none
       * and measures nothing — so the scroll landed on the hub and she was
       * looking at the bear and a Back button instead of the dress code she
       * was filling in. Open the booklet the way a guest would, by pressing
       * its own object on the hub, so the hub keeps its history and its way
       * back; the booklet is its own scroller, so the page inside it is
       * reached by scrolling the booklet rather than the window.
       */
      const booklet = el.closest<HTMLElement>('.inv-booklet');
      if (booklet) {
        const key = booklet.dataset.booklet ?? '';
        if (!booklet.hasAttribute('data-open') && /^[\w-]+$/.test(key)) {
          document.querySelector<HTMLElement>(`[data-opens="${key}"]`)?.click();
        }
        booklet.scrollTop += el.getBoundingClientRect().top - booklet.getBoundingClientRect().top;
        return;
      }
      // The page's own window and nothing above it. scrollIntoView reaches up
      // through a same-origin frame and scrolls the dashboard too, so the
      // builder's phone dragged the Invitation tab down past the Get-started
      // list — and the welcome — on every open.
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY });
    };
    const t1 = setTimeout(go, 80);
    const t2 = setTimeout(go, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [id, page]);
  return null;
}
