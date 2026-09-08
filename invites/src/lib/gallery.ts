import type { Template } from '@prisma/client';
import { paletteFrom } from './theme';

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
};

export function toGalleryTemplate(t: Template): GalleryTemplate {
  const p = paletteFrom(t.palette);
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
  };
}
