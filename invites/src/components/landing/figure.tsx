import type { ReactNode } from 'react';

/**
 * A photograph's place on the page, before and after there is a photograph.
 *
 * The landing page is built around three images the owner supplies. Until they
 * arrive something has to occupy those slots, and the two obvious answers are
 * both wrong: an empty div collapses the layout so nobody can judge the design,
 * and a grey box with a broken-image glyph reads as a bug to every person who
 * sees the site in the meantime.
 *
 * So the empty state is a warm panel with the mark held quietly inside it. It
 * looks chosen. When a real photograph lands, `src` is the only thing that
 * changes — the shape, the radius and the space it occupies are already right,
 * which is the whole reason to build the slot before the picture exists.
 */
export function Figure({
  src,
  alt = '',
  className = '',
  arch = false,
  children,
}: {
  /** The photograph, once there is one. Undefined renders the empty state. */
  src?: string;
  alt?: string;
  className?: string;
  /** The hero's arched top, echoing the alcove the phone sits in. */
  arch?: boolean;
  children?: ReactNode;
}) {
  const shape = `ed-figure ${arch ? 'ed-figure-arch' : ''} ${className}`.trim();
  if (src) {
    // With children, the picture is a backdrop and they stand in front of it,
    // so both share one grid cell and a scrim sits between them. Without, the
    // picture is the whole point and fills the slot.
    if (children) {
      return (
        <div className={`${shape} ed-figure-behind`}>
          <img src={src} alt={alt} loading="lazy" />
          <div className="ed-figure-front">{children}</div>
        </div>
      );
    }
    return (
      <div className={shape}>
        <img src={src} alt={alt} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`${shape} ed-figure-empty`} role="presentation">
      {/* The mark stands in only where the slot is genuinely empty. Given
          something to hold — the hero's phone — it would sit behind that
          instead, which is a watermark nobody asked for. The mark, not the
          wordmark: at a quarter opacity the full lockup's small type turns
          to mush. Decorative, so no alt. */}
      {children ?? <img src="/logo-mark.png" alt="" aria-hidden />}
    </div>
  );
}

/**
 * Where the three photographs go.
 *
 * Named here so that supplying them is one edit in one file rather than a
 * search through the page for the right <Figure>. Fill a value in and that
 * slot stops being a placeholder.
 */
export const PHOTO: { hero?: string; card?: string; band?: string } = {
  // Until the owner's photographs arrive, the designs themselves are the
  // photography — and they are better for it. These are real covers: capiz
  // shells and gypsophila on marble, a dove against a summer sky. A page
  // selling invitations, showing invitations, is not a placeholder standing
  // in for a stock photograph of a table.
  //
  // The two were chosen for tonal range as much as for content. Everything
  // else on this page lives between #fbf8f3 and #e9e1d3, and a storefront
  // with no contrast in it reads as dull however well it is set.
  // The owner's photograph of the set: the alcove, the marble ledge, the
  // travertine plinths and the dried stems. Commit it to public/brand/ and
  // uncomment — the hero switches from the CSS stand-in to the real room and
  // the phone keeps its place on the ledge.
  // hero: '/brand/hero.jpg',
  card: '/covers/capiz.jpg',       // warm gold on the maroon ground; a cool blue fought it
  // band: '/brand/band.jpg',      // the flower, behind the closing call to action
};
