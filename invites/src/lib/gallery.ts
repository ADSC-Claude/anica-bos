import type { Template } from '@prisma/client';
import { paletteFrom, fontsFrom, cssVars, googleFontsUrl } from './theme';
import { builtInSets, findSet, type BookSet } from './fonts';
import { premiumOpeningsFor } from './premium-openings';
import { templateOccasions } from './occasions';
import type { PlateWords } from '@/components/invite/renderer';

/**
 * What a gallery card needs. The landing page and the templates page both
 * show the same cards, so the mapping from a Template row lives here rather
 * than being written out at each call site — a new card field is then one
 * edit, not three.
 */
export type GalleryTemplate = {
  id: string;
  slug: string;
  name: string;
  occasion: Template['occasion'];
  /** The home occasion, then every other it is offered for. */
  occasions: Template['occasion'][];
  minTier: Template['minTier'];
  premium: boolean;
  description: string;
  thumbnailUrl: string;
  layout: string;
  palette: { bg: string; accent: string; accent2: string; ink: string };
  featured: boolean;
  collection: string;
  opening: string;
  /** The premium opening's clip and still — the add-on a design with them can sell. */
  openingVideoUrl: string;
  openingPosterUrl: string;
  /** The design's CSS variables and its Google Fonts sheet, so a preview can set words in its own faces. */
  vars: Record<string, string>;
  fontsUrl: string;
  /** The demo a visitor may scroll from the opening to Our Story, where one exists on this design (src/lib/peek.ts). */
  peekSlug: string;
  /** The design's premium clip, by key, with what happens in it — for the preview's styling and its one sentence. */
  clip: { key: string; blurb: string } | null;
  /**
   * The words the preview sets on the clip's card: the design's demo's own,
   * read from its form (src/lib/peek.ts), so the sample reads the way a
   * guest's will. Null where the design has no demo; the preview then shows
   * its stock sample.
   */
  sample: PlateWords | null;
};

export function toGalleryTemplate(t: Template, sets: BookSet[] = builtInSets()): GalleryTemplate {
  const p = paletteFrom(t.palette);
  // the design's set brings its faces, as it does on the invitation itself (resolveTheme)
  const fonts = findSet(t.look, sets)?.fonts ?? fontsFrom(t.fonts);
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    occasion: t.occasion,
    occasions: templateOccasions(t),
    minTier: t.minTier,
    premium: t.premium,
    description: t.description,
    thumbnailUrl: t.thumbnailUrl,
    layout: t.layout,
    palette: { bg: p.bg, accent: p.accent, accent2: p.accent2, ink: p.ink },
    featured: t.featured,
    collection: t.collection,
    opening: t.opening,
    openingVideoUrl: t.openingVideoUrl,
    openingPosterUrl: t.openingPosterUrl,
    vars: cssVars(p, fonts),
    fontsUrl: googleFontsUrl(fonts),
    peekSlug: '',
    clip: (() => { const c = premiumOpeningsFor(t)[0]; return c ? { key: c.key, blurb: c.blurb } : null; })(),
    sample: null,
  };
}
