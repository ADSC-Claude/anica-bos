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
  /**
   * What happens in the clip, told to a visitor watching the preview: "the
   * seal parts, the card slides out with your names and date set on it".
   * Continues "As your guest sees it: …".
   */
  blurb: string;
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
  /**
   * The line over the names on the card: 'invited' is the opening's own
   * ("You are invited"); 'cover' is the design's cover line ("The christening
   * of"), for a clip whose face has already said the guest is invited.
   */
  eyebrow?: 'invited' | 'cover';
};

export const PREMIUM_OPENINGS: PremiumOpening[] = [
  {
    key: 'capiz',
    name: 'The Capiz Seal',
    tagline: 'A bronze seal breaks and the card slides out with your names on it.',
    blurb: 'the seal parts, the card slides out with your names and date set on it, and your invitation fades in beneath',
    video: '/openings/capiz.mp4',
    poster: '/openings/capiz-poster.jpg',
    designs: ['capiz'],
    words: true,
  },
  {
    // The tag on the ribbon already says the guest is invited; as the bow
    // unties and the ribbons sweep aside, the child's name and the date come
    // up on the clear ground they leave, under the design's cover line.
    key: 'baby-blue-bow',
    name: 'The Blue Bow',
    tagline: 'A satin bow with a tag, untied — the ribbons sweep aside.',
    blurb: "the bow unties, the ribbons sweep aside, your child's name and the date come up on the clear ground they leave, and your invitation fades in beneath",
    video: '/openings/baby-blue.mp4',
    poster: '/openings/baby-blue-poster.jpg',
    designs: ['baby-blue'],
    collections: ['babyblue'],
    words: true,
    eyebrow: 'cover',
  },
];

export const PREMIUM_OPENING_BY_KEY: Record<string, PremiumOpening> = Object.fromEntries(
  PREMIUM_OPENINGS.map((o) => [o.key, o]),
);

/**
 * What a design carries: its slug and collection, which are what pair it
 * with the catalogue, and its own two opening columns, which are what a
 * design drawn in the studio has instead of a catalogue entry.
 *
 * Every field is required on purpose. A caller that passed only the slug
 * would compile and quietly leave a design's own opening unsellable, which
 * is exactly the bug this type exists to prevent.
 */
export type ClipDesign = {
  slug: string;
  collection: string;
  name: string;
  openingVideoUrl: string;
  openingPosterUrl: string;
};

/** The key a design's own opening is stored under. Not in the catalogue: there is one per design. */
export const OWN_OPENING_KEY = 'own';

/**
 * The clips this design can sell, in catalogue order. Empty means the design
 * has no premium opening at all — the add-on is not sold with it.
 *
 * A design whose own two columns are filled and which matches nothing in the
 * catalogue gets one synthetic entry of its own. That is the whole point of
 * the studio: a design somebody draws, with a clip she uploads, should be
 * able to sell its opening without a developer adding an entry above and
 * shipping a release. The clip already played for a guest — `openingAssets`
 * has always fallen back to these columns — but with nothing here the add-on
 * could not be bought, the customer's picker was empty and the admin's
 * "which opening" never appeared. So the clip worked and could not be sold,
 * which is the wrong way round.
 *
 * `words: false`, deliberately. Whether a clip leaves a card blank for the
 * couple's names is a fact about the artwork that only the person who drew
 * it knows, and setting names over a clip that has its own is worse than not
 * setting them at all. A catalogue entry is where somebody says otherwise.
 */
export function premiumOpeningsFor(design: ClipDesign): PremiumOpening[] {
  const made = PREMIUM_OPENINGS.filter(
    (o) => o.designs.includes(design.slug) || Boolean(design.collection && o.collections?.includes(design.collection)),
  );
  if (made.length || !design.openingVideoUrl || !design.openingPosterUrl) return made;
  return [{
    key: OWN_OPENING_KEY,
    name: design.name ? `The ${design.name} opening` : 'This design’s own opening',
    tagline: 'The clip this design was given, played as your envelope.',
    blurb: 'the clip plays, and your invitation fades in beneath it',
    video: design.openingVideoUrl,
    poster: design.openingPosterUrl,
    designs: [design.slug],
    words: false,
  }];
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
