/**
 * The premium openings — the clips somebody drew, sold as an add-on with any
 * package.
 *
 * Every other opening in src/lib/openings.ts is drawn by the browser and works
 * on any design. These do not: a clip is artwork made for one theme, and a
 * Capiz seal in front of a christening would look like a mistake. So a clip
 * names the designs it was made for, and an invitation is offered its own
 * design's clips and no others. A theme may have several — the Baby Blue bow
 * today, another Baby Blue clip next month — and they all show up as choices
 * for a Baby Blue invitation; Capiz has one, and one is what its couples see.
 *
 * Adding a clip is one entry here plus the two files under public/openings.
 * Nothing else has to change: the catalogue is what the checkout gates on,
 * what the customer picks from, and what the guest's page plays.
 */
export type PremiumOpening = {
  /** Also the CSS hook: `.inv-open[data-clip='<key>']` in globals.css. */
  key: string;
  /** How it is named where a customer chooses it. */
  name: string;
  /** The one line under the name. */
  tagline: string;
  video: string;
  poster: string;
  /** The designs it was drawn for, by slug. */
  designs: string[];
  /**
   * And any design in these collections. A theme's next design inherits the
   * theme's clips without anybody remembering to come back here.
   */
  collections?: string[];
  /**
   * The couple's names and date are set on the clip's card as it opens. True
   * where the artwork leaves a card blank for them; false where the clip says
   * its piece on its own and the names wait for the cover.
   */
  words?: boolean;
};

export const PREMIUM_OPENINGS: PremiumOpening[] = [
  {
    key: 'capiz',
    name: 'The Capiz Seal',
    tagline: 'A bronze seal breaks and the card slides out with your names on it.',
    video: '/openings/capiz.mp4',
    poster: '/openings/capiz-poster.jpg',
    designs: ['capiz'],
    words: true,
  },
  {
    // The card is a tag on the ribbon and it carries its own writing, so the
    // names are not set on it: the bow unties, the ribbons sweep aside, and
    // the cover says whose christening it is.
    key: 'baby-blue-bow',
    name: 'The Blue Bow',
    tagline: 'A satin bow with a tag, untied — the ribbons sweep aside.',
    video: '/openings/baby-blue.mp4',
    poster: '/openings/baby-blue-poster.jpg',
    designs: ['baby-blue'],
    collections: ['babyblue'],
  },
];

export const PREMIUM_OPENING_BY_KEY: Record<string, PremiumOpening> = Object.fromEntries(
  PREMIUM_OPENINGS.map((o) => [o.key, o]),
);

/** What a design carries, for its collection: the theme's name is what pairs them. */
export type ClipDesign = { slug: string; collection: string };

/**
 * The clips made for this design, in catalogue order. Empty means the design
 * has no premium opening yet — the add-on is not sold with it.
 */
export function premiumOpeningsFor(design: ClipDesign): PremiumOpening[] {
  return PREMIUM_OPENINGS.filter(
    (o) => o.designs.includes(design.slug) || Boolean(design.collection && o.collections?.includes(design.collection)),
  );
}

/** Whether this design has a premium opening to sell at all. */
export function hasPremiumClip(design: ClipDesign): boolean {
  return premiumOpeningsFor(design).length > 0;
}

/**
 * The clip an invitation plays: the one it chose, so long as that clip is
 * still one of its design's, else the design's first. A customer who switches
 * design keeps a working opening rather than a Capiz seal on a christening.
 */
export function premiumOpeningOf(design: ClipDesign, chosen: string): PremiumOpening | null {
  const offered = premiumOpeningsFor(design);
  return offered.find((o) => o.key === chosen) ?? offered[0] ?? null;
}

/** Whether a key may be stored against this design. '' means "the design's own". */
export function premiumOpeningAllowed(design: ClipDesign, key: string): boolean {
  return key === '' || premiumOpeningsFor(design).some((o) => o.key === key);
}
