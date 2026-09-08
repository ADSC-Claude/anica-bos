import type { Tier } from '@prisma/client';

/**
 * What each tier unlocks. One table, read by the landing page (to draw the
 * comparison), the builder (to lock sections with an Upgrade badge), and the
 * guest page (to decide what to render). If they disagreed, a customer would
 * pay for a feature the guest never sees.
 */
export const TIERS: Tier[] = ['BASIC', 'STANDARD', 'COMPLETE'];

export const TIER_LABELS: Record<Tier, string> = {
  BASIC: 'Basic',
  STANDARD: 'Standard',
  // The top package. "Complete" promised there was nothing left to add, and there is: the add-ons.
  COMPLETE: 'Signature',
};

const RANK: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2 };

export function tierAtLeast(tier: Tier, minimum: Tier): boolean {
  return RANK[tier] >= RANK[minimum];
}

export function nextTier(tier: Tier): Tier | null {
  return tier === 'BASIC' ? 'STANDARD' : tier === 'STANDARD' ? 'COMPLETE' : null;
}

export type FeatureKey =
  | 'templates.any'
  | 'templates.premium'
  | 'palette.presets'
  | 'palette.custom'
  | 'fonts.choice'
  | 'fonts.all'
  | 'fonts.custom'
  | 'gallery.10'
  | 'gallery.unlimited'
  | 'video'
  | 'rsvp.dashboard'
  | 'rsvp.export'
  | 'rsvp.personalLinks'
  | 'rsvp.meal'
  | 'rsvp.autoClose'
  | 'guests.manager'
  | 'guests.import'
  | 'seating'
  | 'checkin'
  | 'guestbook'
  | 'photoSharing'
  | 'slug.custom'
  | 'privacy.password'
  | 'support.chat'
  | 'support.priority';

export const FEATURE_MIN_TIER: Record<FeatureKey, Tier> = {
  'templates.any': 'STANDARD',
  'templates.premium': 'COMPLETE',
  // Colours are every package's to choose: the presets and the custom picker
  // alike. What a package buys is the faces, below.
  'palette.presets': 'BASIC',
  'palette.custom': 'BASIC',
  // The font style — a look, in src/lib/looks.ts. Basic is set in the design's
  // own and picks nothing; Standard chooses among three; Signature among five.
  'fonts.choice': 'STANDARD',
  'fonts.all': 'COMPLETE',
  // The old font presets, faces without the lines: staff's tool, never a
  // customer's, and left at the top package for the invitations that carry one.
  'fonts.custom': 'COMPLETE',
  'gallery.10': 'STANDARD',
  'gallery.unlimited': 'COMPLETE',
  video: 'COMPLETE',
  'rsvp.dashboard': 'STANDARD',
  'rsvp.export': 'STANDARD',
  'rsvp.personalLinks': 'COMPLETE',
  'rsvp.meal': 'COMPLETE',
  'rsvp.autoClose': 'COMPLETE',
  'guests.manager': 'COMPLETE',
  'guests.import': 'COMPLETE',
  seating: 'COMPLETE',
  checkin: 'COMPLETE',
  guestbook: 'COMPLETE',
  photoSharing: 'COMPLETE',
  'slug.custom': 'STANDARD',
  'privacy.password': 'COMPLETE',
  'support.chat': 'STANDARD',
  'support.priority': 'COMPLETE',
};

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

/**
 * How many gallery photos a tier may carry: none for Basic, ten for Standard,
 * Infinity for Signature. Basic's "1 cover photo" in COMPARISON is the cover
 * section's own photo, which is not a gallery row and is not counted here.
 */
export function galleryLimit(tier: Tier): number {
  if (hasFeature(tier, 'gallery.unlimited')) return Infinity;
  if (hasFeature(tier, 'gallery.10')) return 10;
  return 0;
}

/**
 * The comparison table on the landing page, row by row. Text cells are shown
 * as written; booleans become ✓ or —.
 */
export type ComparisonRow = {
  label: string;
  cells: Record<Tier, string | boolean>;
  group?: string;
  /** Built, but kept out of the package for now. Stays out of every table. */
  hidden?: true;
};

/**
 * Features that exist in the code but are not offered yet — too much to
 * encode for Done-For-You, and not what most couples ask for. Nothing is
 * removed: their pages still work if reached, they just are not shown or sold.
 * To offer one later, delete it from this set and un-hide its rows.
 */
export const FUTURE_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>(['guests.manager', 'guests.import', 'seating', 'checkin']);

/** Whether a feature is part of the package customers can see and buy. */
export function featureOffered(feature: FeatureKey): boolean {
  return !FUTURE_FEATURES.has(feature);
}

/** Every row, including the ones held back. The tables use COMPARISON. */
export const COMPARISON_ALL: ComparisonRow[] = [
  { label: 'Template choice', cells: { BASIC: '1 from the Basic set', STANDARD: 'Any template', COMPLETE: 'Any template + Signature-only designs' } },
  { label: 'Colours', cells: { BASIC: 'Yours to choose', STANDARD: 'Yours to choose', COMPLETE: 'Yours to choose' } },
  { label: 'Font style', cells: { BASIC: 'Modern', STANDARD: '3 to choose from', COMPLETE: 'All 5 to choose from' } },
  { label: 'Cover: names, monogram, date, cover photo', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Opening before the invitation (a short moving scene)', cells: { BASIC: 'Included', STANDARD: 'Included', COMPLETE: 'Included' } },
  { label: 'Premium opening video, made for your design', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on' } },
  { label: 'Countdown timer', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Ceremony & reception + Google Maps & Waze buttons', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Parents section', cells: { BASIC: true, STANDARD: true, COMPLETE: true }, hidden: true },
  { label: 'Dress code + colour motif swatches', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Photos', cells: { BASIC: '1 cover photo', STANDARD: 'Gallery up to 10', COMPLETE: 'Unlimited gallery + prenup video' } },
  { label: 'RSVP', cells: { BASIC: 'Simple form', STANDARD: '+ RSVP dashboard, Excel export', COMPLETE: '+ meal choice, auto-close on your deadline' } },
  { label: 'Guest groups on the RSVP (sponsors, family, friends)', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Printable headcount sheet for your caterer or coordinator', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Entourage (ninong & ninang, sponsors, wedding party)', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Our Story / timeline', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Gift note + GCash / bank QR', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Hashtag & social', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'FAQ section', cells: { BASIC: false, STANDARD: true, COMPLETE: true }, hidden: true },
  { label: 'Background music', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Program / timeline of the day', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Accommodation & travel tips', cells: { BASIC: false, STANDARD: false, COMPLETE: true }, hidden: true },
  { label: 'Guest list manager (Excel import, groups, reminders)', cells: { BASIC: false, STANDARD: false, COMPLETE: true }, hidden: true },
  { label: "Seating chart on the guest's page", cells: { BASIC: false, STANDARD: false, COMPLETE: true }, hidden: true },
  { label: 'QR check-in on event day', cells: { BASIC: false, STANDARD: false, COMPLETE: true }, hidden: true },
  { label: 'Guestbook / well-wishes wall', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Post-event photo sharing (guest uploads)', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Link', cells: { BASIC: '/juan-and-maria', STANDARD: '+ custom slug', COMPLETE: '+ password / private option' } },
  { label: 'Revisions after publish (photos and details)', cells: { BASIC: '2', STANDARD: '4', COMPLETE: '6' } },
  { label: 'Design changes after publish', cells: { BASIC: false, STANDARD: false, COMPLETE: false } },
  { label: 'Link validity', cells: { BASIC: 'Event + 30 days', STANDARD: 'Event + 6 months', COMPLETE: 'Event + 1 year' } },
  { label: 'Support', cells: { BASIC: 'Email', STANDARD: 'Messenger / Viber', COMPLETE: 'Priority + 1 free design tweak' } },
];

/** What the landing page, checkout and upgrade page show. */
export const COMPARISON: ComparisonRow[] = COMPARISON_ALL.filter((r) => !r.hidden);

