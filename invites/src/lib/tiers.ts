import type { Tier } from '@prisma/client';

/**
 * What each tier unlocks. One table, read by the landing page (to draw the
 * comparison), the builder (to lock sections with an Upgrade badge), and the
 * guest page (to decide what to render). If they disagreed, a customer would
 * pay for a feature the guest never sees.
 */
export const TIERS: Tier[] = ['BASIC', 'STANDARD', 'COMPLETE', 'LUXURY'];

export const TIER_LABELS: Record<Tier, string> = {
  BASIC: 'Basic',
  STANDARD: 'Standard',
  // "Complete" promised there was nothing left to add, and there was: the
  // add-ons, and now Luxury above it. The stored value is what every order ever
  // sold carries, so only the label moved.
  COMPLETE: 'Signature',
  LUXURY: 'Luxury',
};

/**
 * How the packages order. Exported because three other files kept their own
 * copy of it, and a fourth package meant finding all three — which is the
 * argument for there being one.
 */
export const RANK: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2, LUXURY: 3 };

export function tierAtLeast(tier: Tier, minimum: Tier): boolean {
  return RANK[tier] >= RANK[minimum];
}

export function nextTier(tier: Tier): Tier | null {
  const i = TIERS.indexOf(tier);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1]! : null;
}

export type FeatureKey =
  | 'templates.any'
  | 'templates.premium'
  | 'palette.presets'
  | 'palette.custom'
  | 'fonts.choice'
  | 'fonts.all'
  | 'fonts.custom'
  | 'gallery.limited'
  | 'gallery.unlimited'
  | 'video'
  | 'rsvp.dashboard'
  | 'rsvp.export'
  | 'rsvp.personalLinks'
  | 'rsvp.meal'
  | 'rsvp.autoClose'
  | 'rsvp.emailConfirmation'
  | 'guests.manager'
  | 'guests.import'
  | 'seating'
  | 'checkin'
  | 'guestbook'
  | 'photoSharing'
  | 'saveTheDate.included'
  | 'slug.custom'
  | 'privacy.password';

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
  'gallery.limited': 'STANDARD',
  'gallery.unlimited': 'LUXURY',
  video: 'COMPLETE',
  'rsvp.dashboard': 'STANDARD',
  'rsvp.export': 'STANDARD',
  'rsvp.personalLinks': 'COMPLETE',
  'rsvp.meal': 'COMPLETE',
  'rsvp.autoClose': 'COMPLETE',
  // Every guest who leaves an address gets a confirmation of what they
  // answered, and it costs the couple nothing. Free only at the top, because
  // below it the same send is the paid e-mail blast.
  'rsvp.emailConfirmation': 'LUXURY',
  'guests.manager': 'COMPLETE',
  'guests.import': 'COMPLETE',
  seating: 'LUXURY',
  checkin: 'LUXURY',
  guestbook: 'COMPLETE',
  photoSharing: 'LUXURY',
  // The second card is still an add-on anybody may buy; Luxury is not charged
  // for it. See addOnAvailable and quote() in pricing.ts.
  'saveTheDate.included': 'LUXURY',
  'slug.custom': 'STANDARD',
  'privacy.password': 'COMPLETE',
};

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

/**
 * How many gallery photos a tier may carry.
 *
 * The packages are sold as ranges — five to seven on Standard, ten to fifteen
 * on Signature — because what a couple wants to know is roughly how many their
 * story takes, not a ceiling. The number here is the top of the range, since a
 * limit that bit before the number we printed would be the one thing worse
 * than no range at all.
 *
 * Basic's "1 cover photo" in COMPARISON is the cover section's own photo. That
 * is not a gallery row and is not counted here.
 */
export function galleryLimit(tier: Tier): number {
  if (hasFeature(tier, 'gallery.unlimited')) return Infinity;
  if (hasFeature(tier, 'gallery.limited')) return tierAtLeast(tier, 'COMPLETE') ? 15 : 7;
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
 * Features that exist in the code but are not offered — held back rather than
 * removed, so their pages still work if reached; they simply are not shown or
 * sold. To hold one back, add it here and mark its COMPARISON rows `hidden`.
 *
 * Accommodation & travel tips is held back today: it is built and works for
 * any invitation that has it, but it is not drawn on the website. It asks a
 * couple to write a hotel list they mostly do not have when they are choosing
 * a package, and a row nobody can fill in reads as a package that is missing
 * something. The guest list manager, its Excel import, the
 * seating chart and event-day check-in sat here on the reasoning that they were
 * too much to encode for Done-For-You. That reasoning does not survive the
 * shape the service ended up in: the guest list is the one part of an
 * invitation we cannot write for a couple, because only they know who is
 * coming — so it is theirs to fill in, with an Excel import for the long ones,
 * and it is not encoding work at all. They are Signature's, and sold.
 */
export const FUTURE_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>();

/** Whether a feature is part of the package customers can see and buy. */
export function featureOffered(feature: FeatureKey): boolean {
  return !FUTURE_FEATURES.has(feature);
}

/** Every row, including the ones held back. The tables use COMPARISON. */
export const COMPARISON_ALL: ComparisonRow[] = [
  { label: 'Template choice', cells: { BASIC: '1 from the Basic set', STANDARD: 'Any template', COMPLETE: 'Any template + Signature-only designs', LUXURY: 'Any template + Signature-only designs' } },
  { label: 'Font style', cells: { BASIC: 'Modern', STANDARD: '3 to choose from', COMPLETE: 'All 5 to choose from', LUXURY: 'All 5 to choose from' } },
  { label: 'Cover: names, monogram, date, cover photo', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Opening before the invitation (a short moving scene)', cells: { BASIC: 'Included', STANDARD: 'Included', COMPLETE: 'Included', LUXURY: 'Included' } },
  { label: 'Premium opening video, made for your design', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on', LUXURY: 'Add-on' } },
  { label: 'Countdown timer', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Ceremony & reception + Google Maps & Waze buttons', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Parents section', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Dress code + colour motif swatches', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Photos', cells: { BASIC: '1 cover photo', STANDARD: '5 to 7 photos', COMPLETE: '10 to 15 photos + prenup video', LUXURY: 'Unlimited gallery + prenup video' } },
  { label: 'RSVP', cells: { BASIC: 'Simple form', STANDARD: '+ RSVP dashboard, Excel export', COMPLETE: '+ meal choice, auto-close on your deadline', LUXURY: '+ meal choice, auto-close on your deadline' } },
  { label: 'E-mail confirmation to each guest who replies', cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
  { label: 'SMS blast to your guest list', cells: { BASIC: false, STANDARD: false, COMPLETE: 'Ask us — texts priced per pack', LUXURY: 'Ask us — texts priced per pack' } },
  { label: 'Guest groups on the RSVP (sponsors, family, friends)', cells: { BASIC: true, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Printable headcount sheet for your caterer or coordinator', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Entourage (ninong & ninang, sponsors, wedding party)', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Our Story / timeline', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Gift note + GCash / bank QR', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Hashtag & social', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'FAQ section', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Background music', cells: { BASIC: false, STANDARD: true, COMPLETE: true, LUXURY: true } },
  { label: 'Program / timeline of the day', cells: { BASIC: false, STANDARD: false, COMPLETE: true, LUXURY: true } },
  { label: 'Accommodation & travel tips', cells: { BASIC: false, STANDARD: false, COMPLETE: true, LUXURY: true }, hidden: true },
  { label: 'Guest list manager (Excel import, groups, a personal link per guest)', cells: { BASIC: false, STANDARD: false, COMPLETE: true, LUXURY: true } },
  { label: "Seating chart on the guest's page", cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
  { label: 'QR check-in on event day', cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
  { label: 'Guestbook / well-wishes wall', cells: { BASIC: false, STANDARD: false, COMPLETE: true, LUXURY: true } },
  { label: 'Post-event photo sharing (guest uploads)', cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
  { label: 'Save the Date card (a second card, months ahead)', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on', LUXURY: 'Included' } },
  { label: 'Link', cells: { BASIC: '/juan-and-maria', STANDARD: '+ custom slug', COMPLETE: '+ password / private option', LUXURY: '+ password / private option' } },
  { label: 'Revisions (rounds of changes before we publish)', cells: { BASIC: '2 rounds', STANDARD: '4 rounds', COMPLETE: '6 rounds', LUXURY: '8 rounds' } },
  { label: 'Link validity', cells: { BASIC: 'Event + 30 days', STANDARD: 'Event + 6 months', COMPLETE: 'Event + 1 year', LUXURY: 'Event + 1 year' } },
];

/** What the landing page, checkout and upgrade page show. */
export const COMPARISON: ComparisonRow[] = COMPARISON_ALL.filter((r) => !r.hidden);

