import type { Occasion, Tier } from '@prisma/client';
import { PALETTE_PRESETS, FONT_PRESETS } from '../src/lib/theme';

/**
 * Every design the shop sells, as data.
 *
 * The seed creates these on a fresh database and `scripts/sync-templates.ts`
 * upserts them into a database that already has customers — so a new design,
 * a renamed one or a re-pointed opening reaches production without the seed's
 * TRUNCATE anywhere near it. Editing a row here and running the sync is how a
 * design ships.
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
  palette: ReturnType<typeof pal>;
  fonts: ReturnType<typeof fonts>;
  featured: boolean;
  description: string;
  thumb: string;
};

export const TEMPLATES: TemplateSeed[] = [
  // The White Collection — the flagship wedding family. Each design is
  // built around one opening, which is why the design and the opening
  // share a name. See src/lib/openings.ts.
  { slug: 'the-drape', name: 'The Drape', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'classic', collection: 'white', opening: 'drape', palette: pal('white'), fonts: fonts('serif'), featured: true, description: 'A new chapter begins. Silk lifts away from your names in warm white and taupe.', thumb: pic('the-drape') },
  { slug: 'the-seal', name: 'The Seal', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'white', opening: 'seal', palette: pal('champagne'), fonts: fonts('serif'), featured: true, description: 'A story, sealed with love. Your monogram pressed into wax on ivory and champagne.', thumb: pic('the-seal') },
  { slug: 'the-curtain', name: 'The Curtain', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'classic', collection: 'white', opening: 'curtain', palette: pal('linen'), fonts: fonts('editorial'), featured: true, description: 'A beautiful reveal. Sheer curtains part over your photo — made for a beach or garden ceremony.', thumb: pic('the-curtain') },
  { slug: 'the-line', name: 'The Line', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'modern', collection: 'white', opening: 'line', palette: pal('white'), fonts: fonts('editorial'), featured: false, description: 'The best is yet to come. One gold curve on warm white, and nothing else.', thumb: pic('the-line') },
  { slug: 'photo-story', name: 'Photo Story', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'white', opening: 'photo', palette: pal('linen'), fonts: fonts('script'), featured: false, description: 'A glimpse of your greatest moments. Three of your photos fanned like prints, in black and white.', thumb: pic('photo-story') },
  { slug: 'classic-ivory', name: 'Classic Ivory', occasion: 'WEDDING', minTier: 'BASIC', layout: 'classic', collection: 'white', opening: 'envelope', palette: pal('ivory'), fonts: fonts('serif'), featured: true, description: 'Full-bleed photo, serif names, sage and gold.', thumb: pic('classic-ivory') },
  { slug: 'garden-botanical', name: 'Garden Botanical', occasion: 'WEDDING', minTier: 'BASIC', layout: 'garden', collection: 'garden', opening: 'envelope', palette: pal('emerald'), fonts: fonts('serif'), featured: true, description: 'Arched photo, emerald and ivory. Tagaytay energy.', thumb: pic('garden-botanical') },
  { slug: 'modern-minimal', name: 'Modern Minimal', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'modern', collection: '', opening: 'line', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Uppercase sans, black and white, lots of air.', thumb: pic('modern-minimal') },
  { slug: 'filipiniana-gold', name: 'Filipiniana Gold', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'filipiniana', opening: 'seal', palette: pal('royal'), fonts: fonts('script'), featured: true, description: 'Royal blue and gold, script names. Premium.', thumb: pic('filipiniana-gold') },
  { slug: 'beach-sunset', name: 'Beach Sunset', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'classic', collection: '', opening: 'curtain', palette: pal('sunset'), fonts: fonts('editorial'), featured: false, description: 'Warm sunset tones for Boracay, Siargao and La Union.', thumb: pic('beach-sunset') },
  { slug: 'enchanted-blush', name: 'Enchanted Blush', occasion: 'DEBUT', minTier: 'BASIC', layout: 'festive', collection: 'blush', opening: 'envelope', palette: pal('blush'), fonts: fonts('script'), featured: true, description: 'Blush and gold with a script name for the debutante.', thumb: pic('enchanted-blush') },
  { slug: 'starlight-debut', name: 'Starlight', occasion: 'DEBUT', minTier: 'STANDARD', premium: true, layout: 'editorial', collection: 'midnight', opening: 'curtain', palette: pal('lilac'), fonts: fonts('editorial'), featured: false, description: 'Lilac and silver. Premium.', thumb: pic('starlight') },
  { slug: 'little-cloud', name: 'Little Cloud', occasion: 'CHRISTENING', minTier: 'BASIC', layout: 'garden', palette: pal('dusty'), fonts: fonts('playful'), featured: true, description: 'Dusty blue, soft and gentle. Binyag + 1st birthday ready.', thumb: pic('little-cloud') },
  { slug: 'party-pop', name: 'Party Pop', occasion: 'KIDS_BIRTHDAY', minTier: 'BASIC', layout: 'festive', palette: pal('pastel'), fonts: fonts('playful'), featured: true, description: 'Confetti and pastels for a lucky 7th.', thumb: pic('party-pop') },
  { slug: 'golden-hour', name: 'Golden Hour', occasion: 'MILESTONE_BIRTHDAY', minTier: 'BASIC', layout: 'editorial', palette: pal('navy'), fonts: fonts('serif'), featured: false, description: 'Navy and champagne for a 50th or 60th.', thumb: pic('golden-hour') },
  { slug: 'silver-jubilee', name: 'Silver Jubilee', occasion: 'ANNIVERSARY', minTier: 'BASIC', layout: 'classic', palette: pal('navy'), fonts: fonts('script'), featured: false, description: 'For silver and golden anniversaries and renewals of vows.', thumb: pic('silver-jubilee') },
  { slug: 'boardroom', name: 'Boardroom', occasion: 'CORPORATE', minTier: 'BASIC', layout: 'modern', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Logo, agenda, speakers and a registration QR.', thumb: pic('boardroom') },
  { slug: 'quiet-light', name: 'Quiet Light', occasion: 'MEMORIAL', minTier: 'BASIC', layout: 'quiet', palette: pal('slate'), fonts: fonts('serif'), featured: false, description: 'Muted and respectful, for the 40th day and babang luksa.', thumb: pic('quiet-light') },
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
    palette: t.palette as never,
    fonts: t.fonts as never,
    sections: [] as string[],
    featured: t.featured,
    description: t.description,
    thumbnailUrl: t.thumb,
    sortOrder,
  };
}
