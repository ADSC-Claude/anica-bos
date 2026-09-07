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
export const OPENING_KEYS = ['none', 'envelope', 'line', 'curtain', 'drape', 'seal', 'photo'] as const;
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
];

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
}): OpeningKey {
  const wanted = isOpening(args.chosen) && args.chosen !== 'none'
    ? args.chosen
    : args.chosen === 'none'
      ? 'none'
      : isOpening(args.templateDefault)
        ? args.templateDefault
        : args.legacyEnvelope
          ? 'envelope'
          : 'none';
  if (wanted === 'none') return 'none';
  return tierAtLeast(args.tier, OPENING_BY_KEY[wanted].minTier) ? wanted : 'envelope';
}

/** The openings a customer on this tier may pick, for the builder's dropdown. */
export function openingsFor(tier: Tier): OpeningDef[] {
  return OPENINGS.filter((o) => tierAtLeast(tier, o.minTier));
}
