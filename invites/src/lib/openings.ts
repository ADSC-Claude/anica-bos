import type { Tier } from '@prisma/client';
import { tierAtLeast } from './tiers';

/**
 * The opening is the short moving scene a guest sees before the invitation
 * itself. It is the first thing they get after tapping a link in Messenger,
 * so it has to be fast: every one of these is drawn by the browser from the
 * couple's own words and photos — no video file, nothing to download, nothing
 * to re-render when a name changes.
 *
 * Each opening is a full-screen overlay with a "closed" state and an exit
 * animation. The markup is the same for all of them (see Opening in
 * components/invite/client.tsx); the stage pieces and the CSS in globals.css
 * are what differ.
 */
/** In catalogue order — cheapest first, so the builder's dropdown reads as a ladder. */
export const OPENING_KEYS = ['none', 'envelope', 'line', 'curtain', 'drape', 'seal', 'photo', 'cinematic'] as const;
export type OpeningKey = (typeof OPENING_KEYS)[number];

export type OpeningDef = {
  key: OpeningKey;
  /** "The Drape" — how it is sold and named in the builder. */
  name: string;
  /** The one line under the name in the gallery. */
  tagline: string;
  /** What the guest actually sees, for the hint text in the builder. */
  description: string;
  minTier: Tier;
  /** How many photos the stage uses. 0 means it never asks for one. */
  photos: 0 | 1 | 3;
  /** The words on the closed screen when the customer has not written their own. */
  line: { en: string; tl: string };
  /** Set in small caps and letterspaced rather than in the script face. */
  caps?: boolean;
  /**
   * Encoded by staff, not chosen in the builder. A customer cannot pick this
   * one: it exists only once somebody has made the artwork for it, so
   * offering it in a dropdown would promise what the invitation has not got.
   */
  staffOnly?: boolean;
};

export const OPENINGS: OpeningDef[] = [
  {
    key: 'none',
    name: 'No opening',
    tagline: 'Straight to the invitation.',
    description: 'The invitation shows immediately. Fastest, and right for a Save the Date or a memorial.',
    minTier: 'BASIC',
    photos: 0,
    line: { en: '', tl: '' },
  },
  {
    key: 'envelope',
    name: 'The Envelope',
    tagline: 'The one everyone knows.',
    description: 'A closed envelope with your monogram on the seal. The flap opens on tap.',
    minTier: 'BASIC',
    photos: 0,
    line: { en: 'You are invited', tl: 'Ikaw ay inaanyayahan' },
    caps: true,
  },
  {
    key: 'line',
    name: 'The Line',
    tagline: 'The best is yet to come.',
    description: 'A single gold curve draws itself across warm white, your line of script underneath. It sweeps aside on tap.',
    minTier: 'STANDARD',
    photos: 0,
    line: { en: 'and so it begins', tl: 'at dito nagsisimula' },
  },
  {
    key: 'curtain',
    name: 'The Curtain',
    tagline: 'A beautiful reveal.',
    description: 'Two sheer curtains breathe over your photo, then part to the sides.',
    minTier: 'STANDARD',
    photos: 1,
    line: { en: 'Together always', tl: 'Magkasama magpakailanman' },
    caps: true,
  },
  {
    key: 'drape',
    name: 'The Drape',
    tagline: 'A new chapter begins.',
    description: 'A hanging silk drape with your names on it, lifted away on tap.',
    minTier: 'COMPLETE',
    photos: 0,
    line: { en: 'A new chapter begins', tl: 'Isang bagong yugto' },
    caps: true,
  },
  {
    key: 'seal',
    name: 'The Seal',
    tagline: 'A story, sealed with love.',
    description: 'A wax seal pressed with your monogram. It lifts, the flap folds back and the card rises.',
    minTier: 'COMPLETE',
    photos: 0,
    line: { en: 'Our forever begins here', tl: 'Dito nagsisimula ang forever' },
    caps: true,
  },
  {
    key: 'photo',
    name: 'Photo Story',
    tagline: 'A glimpse of your greatest moments.',
    description: 'Three of your photos fanned like prints on a table, with your names and date. They slide apart on tap.',
    minTier: 'COMPLETE',
    photos: 3,
    line: { en: 'Same people, new adventures', tl: 'Parehong tao, bagong yugto' },
  },
  {
    key: 'cinematic',
    name: 'Cinematic opening',
    tagline: 'An invitation that opens like a gift.',
    description: 'Embroidered panels tied with a silk bow. The bow unties, the panels draw back, and the invitation is behind them. Made by our designers, and part of Done-For-You.',
    minTier: 'COMPLETE',
    photos: 0,
    line: { en: '', tl: '' },
    staffOnly: true,
  },
];

/**
 * The cinematic opening is the illustrated one — a bow untying, panels drawing
 * back — and the only opening that loads a file. It is deliberately outside
 * the self-serve set: the clip is artwork somebody made, so it arrives with a
 * Done-For-You or Concierge order rather than from a dropdown.
 *
 * It is still one shared clip per design, not a render per couple. The names,
 * date and countdown stay live text over the top, so a nickname changed at
 * 11pm reads correctly on the next reload. Only Concierge, where the artwork
 * itself is drawn for one couple, replaces the shared clip.
 */
export const OPENING_BY_KEY: Record<OpeningKey, OpeningDef> = Object.fromEntries(
  OPENINGS.map((o) => [o.key, o]),
) as Record<OpeningKey, OpeningDef>;

export function isOpening(value: string): value is OpeningKey {
  return (OPENING_KEYS as readonly string[]).includes(value);
}

export function openingName(key: string): string {
  return isOpening(key) ? OPENING_BY_KEY[key].name : 'No opening';
}

/**
 * Which opening a guest actually gets.
 *
 * Order: what the customer chose, else what the design ships with, else none.
 * `legacyEnvelope` is the old cover toggle — invitations built before the
 * openings existed carry it, and it still means "the envelope".
 *
 * An opening above the invitation's tier falls back to the envelope rather
 * than to nothing, so a downgrade never leaves a guest staring at a blank
 * first screen where there used to be one.
 */
export function resolveOpening(args: {
  chosen: string;
  templateDefault: string;
  legacyEnvelope: boolean;
  tier: Tier;
  /** True once a cinematic clip has been encoded for this invitation or its design. */
  cinematic?: boolean;
}): OpeningKey {
  // A customer who turned the opening off keeps it off, whatever staff have
  // since attached — "none" is a decision, not a gap waiting to be filled.
  if (args.chosen === 'none') return 'none';
  // Otherwise the artwork wins: if a clip was made for this invitation, that
  // is what the guest should get.
  if (args.cinematic && tierAtLeast(args.tier, 'COMPLETE')) return 'cinematic';
  // Past this point the cinematic opening is unreachable: it is supplied by
  // artwork alone, so naming it in a template or a saved choice must not
  // select it. Without this a design that names it but has no clip yet would
  // hand the guest an empty <video> and a screen that never opens.
  const drawn = (k: string): k is OpeningKey => isOpening(k) && k !== 'none' && !OPENING_BY_KEY[k].staffOnly;
  const wanted: OpeningKey = drawn(args.chosen)
    ? args.chosen
    : drawn(args.templateDefault)
      ? args.templateDefault
      : args.legacyEnvelope
        ? 'envelope'
        : 'none';
  if (wanted === 'none') return 'none';
  return tierAtLeast(args.tier, OPENING_BY_KEY[wanted].minTier) ? wanted : 'envelope';
}

/**
 * The openings a customer on this tier may pick, for the builder's dropdown.
 * Staff-only openings never appear: there is nothing to choose until the
 * artwork exists.
 */
export function openingsFor(tier: Tier): OpeningDef[] {
  return OPENINGS.filter((o) => !o.staffOnly && tierAtLeast(tier, o.minTier));
}

/** The clip and its poster, preferring the pair made for this couple. */
export function openingAssets(
  invitation: { openingVideoUrl: string; openingPosterUrl: string },
  template: { openingVideoUrl: string; openingPosterUrl: string },
): { video: string; poster: string } {
  return invitation.openingVideoUrl
    ? { video: invitation.openingVideoUrl, poster: invitation.openingPosterUrl }
    : { video: template.openingVideoUrl, poster: template.openingPosterUrl };
}
