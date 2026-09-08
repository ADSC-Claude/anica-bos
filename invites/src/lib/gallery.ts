import type { Template } from '@prisma/client';
import { paletteFrom, fontsFrom, cssVars, googleFontsUrl } from './theme';
import { LOOK_BY_KEY, isLook } from './looks';

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
};

export function toGalleryTemplate(t: Template): GalleryTemplate {
  const p = paletteFrom(t.palette);
  // the design's look sets its faces, as it does on the invitation itself (resolveTheme)
  const fonts = t.look && isLook(t.look) ? LOOK_BY_KEY[t.look].fonts : fontsFrom(t.fonts);
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    occasion: t.occasion,
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
  };
}
