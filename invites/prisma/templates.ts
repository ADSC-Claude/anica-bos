import type { Occasion, Tier } from '@prisma/client';
import { PALETTE_PRESETS, FONT_PRESETS } from '../src/lib/theme';
import type { LookKey } from '../src/lib/looks';

/**
 * Every design the shop sells, as data.
 *
 * The seed creates these on a fresh database and `scripts/sync-templates.ts`
 * upserts them into a database that already has customers — so a new design,
 * a renamed one or a re-pointed opening reaches production without the seed's
 * TRUNCATE anywhere near it. Editing a row here and running the sync is how a
 * design ships.
 *
 * A design marked `retired` stays in the catalogue so the invitations built on
 * it keep rendering, but it is unpublished: off the shop floor, out of the
 * checkout, gone from the gallery. Only Capiz is on sale while the new
 * designs are made, and each is shown to the public by its opening alone.
 */
const pal = (key: string) => PALETTE_PRESETS.find((p) => p.key === key)!.palette;
const fonts = (key: string) => FONT_PRESETS.find((f) => f.key === key)!.fonts;
const pic = (seed: string, w = 900, h = 1200) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

export type TemplateSeed = {
  slug: string;
  name: string;
  occasion: Occasion;
  minTier: Tier;
  premium?: boolean;
  layout: string;
  /** src/lib/collections.ts. Blank means the design is in no collection. */
  collection?: string;
  /** src/lib/openings.ts. Blank means the design opens with nothing. */
  opening?: string;
  /**
   * A cinematic opening's shared clip and its poster. Both or neither: the
   * poster is the whole closed screen until the guest taps, so a clip without
   * one leaves them on a blank screen while it buffers.
   */
  openingVideoUrl?: string;
  openingPosterUrl?: string;
  palette: ReturnType<typeof pal>;
  fonts: ReturnType<typeof fonts>;
  /** src/lib/looks.ts. Set, the look's fonts replace `fonts` and its lines appear under the headings. */
  look?: LookKey;
  featured: boolean;
  description: string;
  thumb: string;
  /** Kept for the invitations on it, but not on sale. */
  retired?: boolean;
};

export const TEMPLATES: TemplateSeed[] = [
  // The Filipiniana Collection. Capiz is the flagship: shell, bronze wax and
  // the seal opening, for a wedding that looks like home.
  { slug: 'capiz', name: 'Capiz', occasion: 'WEDDING', minTier: 'STANDARD', premium: false, layout: 'capiz', collection: 'filipiniana', opening: 'universal', openingVideoUrl: '/openings/capiz.mp4', openingPosterUrl: '/openings/capiz-poster.jpg', palette: pal('capiz'), fonts: fonts('capiz'), look: 'heritage', featured: true, description: 'Capiz shell and bronze wax. Your guest taps the seal and it unfolds. Made for a wedding that looks like home.', thumb: '/covers/capiz.jpg' },
  { slug: 'classic-ivory', name: 'Classic Ivory', occasion: 'WEDDING', minTier: 'BASIC', layout: 'classic', collection: '', opening: 'universal', palette: pal('ivory'), fonts: fonts('serif'), featured: true, description: 'Full-bleed photo, serif names, sage and gold.', thumb: pic('classic-ivory') , retired: true },
  { slug: 'garden-botanical', name: 'Garden Botanical', occasion: 'WEDDING', minTier: 'BASIC', layout: 'garden', collection: 'garden', opening: 'universal', palette: pal('emerald'), fonts: fonts('serif'), featured: true, description: 'Arched photo, emerald and ivory. Tagaytay energy.', thumb: pic('garden-botanical') , retired: true },
  { slug: 'modern-minimal', name: 'Modern Minimal', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'modern', collection: '', opening: 'universal', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Uppercase sans, black and white, lots of air.', thumb: pic('modern-minimal') , retired: true },
  { slug: 'filipiniana-gold', name: 'Filipiniana Gold', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'filipiniana', opening: 'universal', palette: pal('royal'), fonts: fonts('script'), featured: true, description: 'Royal blue and gold, script names. Premium.', thumb: pic('filipiniana-gold') , retired: true },
  { slug: 'beach-sunset', name: 'Beach Sunset', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'classic', collection: '', opening: 'universal', palette: pal('sunset'), fonts: fonts('editorial'), featured: false, description: 'Warm sunset tones for Boracay, Siargao and La Union.', thumb: pic('beach-sunset') , retired: true },
  { slug: 'enchanted-blush', name: 'Enchanted Blush', occasion: 'DEBUT', minTier: 'BASIC', layout: 'festive', collection: 'blush', opening: 'universal', palette: pal('blush'), fonts: fonts('script'), featured: true, description: 'Blush and gold with a script name for the debutante.', thumb: pic('enchanted-blush') , retired: true },
  { slug: 'starlight-debut', name: 'Starlight', occasion: 'DEBUT', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'midnight', opening: 'universal', palette: pal('lilac'), fonts: fonts('editorial'), featured: false, description: 'Lilac and silver. Premium.', thumb: pic('starlight') , retired: true },
  { slug: 'little-cloud', name: 'Little Cloud', occasion: 'CHRISTENING', minTier: 'BASIC', layout: 'garden', opening: 'universal', palette: pal('dusty'), fonts: fonts('playful'), featured: true, description: 'Dusty blue, soft and gentle. Binyag + 1st birthday ready.', thumb: pic('little-cloud') , retired: true },
  { slug: 'party-pop', name: 'Party Pop', occasion: 'KIDS_BIRTHDAY', minTier: 'BASIC', layout: 'festive', opening: 'universal', palette: pal('pastel'), fonts: fonts('playful'), featured: true, description: 'Confetti and pastels for a lucky 7th.', thumb: pic('party-pop') , retired: true },
  { slug: 'golden-hour', name: 'Golden Hour', occasion: 'MILESTONE_BIRTHDAY', minTier: 'BASIC', layout: 'editorial', opening: 'universal', palette: pal('navy'), fonts: fonts('serif'), featured: false, description: 'Navy and champagne for a 50th or 60th.', thumb: pic('golden-hour') , retired: true },
  { slug: 'silver-jubilee', name: 'Silver Jubilee', occasion: 'ANNIVERSARY', minTier: 'BASIC', layout: 'classic', opening: 'universal', palette: pal('navy'), fonts: fonts('script'), featured: false, description: 'For silver and golden anniversaries and renewals of vows.', thumb: pic('silver-jubilee') , retired: true },
  { slug: 'boardroom', name: 'Boardroom', occasion: 'CORPORATE', minTier: 'BASIC', layout: 'modern', opening: 'universal', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Logo, agenda, speakers and a registration QR.', thumb: pic('boardroom') , retired: true },
  { slug: 'quiet-light', name: 'Quiet Light', occasion: 'MEMORIAL', minTier: 'BASIC', layout: 'quiet', opening: 'universal', palette: pal('slate'), fonts: fonts('serif'), featured: false, description: 'Muted and respectful, for the 40th day and babang luksa.', thumb: pic('quiet-light') , retired: true },
];

/** The Prisma payload for one row. `sortOrder` is its position in the list. */
export function templateData(t: TemplateSeed, sortOrder: number) {
  return {
    slug: t.slug,
    name: t.name,
    occasion: t.occasion,
    minTier: t.minTier,
    premium: t.premium ?? false,
    layout: t.layout,
    collection: t.collection ?? '',
    opening: t.opening ?? '',
    openingVideoUrl: t.openingPosterUrl ? t.openingVideoUrl ?? '' : '',
    openingPosterUrl: t.openingPosterUrl ?? '',
    palette: t.palette as never,
    fonts: t.fonts as never,
    look: t.look ?? '',
    sections: [] as string[],
    featured: t.featured,
    description: t.description,
    thumbnailUrl: t.thumb,
    sortOrder,
    published: !t.retired,
  };
}
