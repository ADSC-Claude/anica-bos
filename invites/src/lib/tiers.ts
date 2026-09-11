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
};

export function hasFeature(tier: Tier, feature: FeatureKey): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

/**
 * Add-ons that buy a feature outright, on a package that does not include it.
 *
 * Everything else in this file is a reason to move up a package; these three
 * are the exceptions, and they are exceptions for the same reason. Each is
 * wanted by a couple who want one thing rather than the whole tier — a small
 * wedding that wants the door scanned, a garden reception that wants a seating
 * chart, a family that wants the link behind a password — and telling them to
 * buy Signature to get it loses a sale they were ready to make.
 *
 * Each maps to a LIST, because two of them do not work alone. Check-in scans a
 * guest's token and seating puts a name at a table, so both need the guest
 * list and the per-guest links that carry the tokens; sold without those, a
 * couple would pay ₱1,000 for a page they can never put anybody on. So an
 * add-on grants what it needs to actually work, and the list comes with it.
 *
 * That is most of what separates Signature from Basic, for ₱1,000 — worth
 * knowing when either price moves. It is not a slip: there is no smaller
 * honest version. The Excel import is in the list for the same reason, not a
 * generous one — it shares requireGuestManager with the list itself, so
 * withholding it would mean a gate that does not exist today, to stop a
 * customer pasting a spreadsheet into a list they already own.
 *
 * The first entry is the headline: the thing being bought, and the one that
 * decides whether a tier is offered the add-on at all.
 *
 * A feature must already be built and already sold on some tier before it
 * appears here. An add-on is a second door to a room that exists, never a
 * promise of one.
 */
export const ADDON_FEATURE: Readonly<Record<string, readonly FeatureKey[]>> = {
  QR_CHECKIN: ['checkin', 'guests.manager', 'guests.import', 'rsvp.personalLinks'],
  SEATING_VIEWER: ['seating', 'guests.manager', 'guests.import', 'rsvp.personalLinks'],
  PASSWORD: ['privacy.password'],
};

/**
 * An invitation, as far as what it is allowed to do is concerned: the package
 * it was sold under, and the add-ons bought beside it.
 *
 * `addOns` is required rather than optional on purpose. Forgetting it would
 * not fail — it would read as "bought nothing" and quietly shut a paying
 * customer out of what they paid for, which is the one wrong answer here that
 * nobody would report as a bug. A caller that has only a tier to hand is
 * asking a different question and wants hasFeature.
 */
export type Entitled = { tier: Tier; addOns: string[] };

/**
 * Whether this invitation may use a feature — because its package includes it,
 * or because it was bought on its own.
 *
 * Every gate on a feature reachable through ADDON_FEATURE reads this rather
 * than hasFeature. The two stay separate because most of this codebase is
 * asking what a *tier* includes — the comparison table, the upgrade page, the
 * builder's padlocks — and that question has no invitation to ask about.
 */
export function entitled(inv: Entitled, feature: FeatureKey): boolean {
  if (hasFeature(inv.tier, feature)) return true;
  return inv.addOns.some((code) => ADDON_FEATURE[code]?.includes(feature));
}

/** The add-on a package without this feature buys to have it anyway. */
export function addOnForFeature(feature: FeatureKey): string | undefined {
  return Object.keys(ADDON_FEATURE).find((code) => ADDON_FEATURE[code][0] === feature);
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
 * Features that exist in the code but are not offered — held back rather than
 * removed, so their pages still work if reached; they simply are not shown or
 * sold. To hold one back, add it here and mark its COMPARISON rows `hidden`.
 *
 * Nothing is held back today. The guest list manager, its Excel import, the
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
  { label: 'Template choice', cells: { BASIC: '1 from the Basic set', STANDARD: 'Any template', COMPLETE: 'Any template + Signature-only designs' } },
  { label: 'Colours', cells: { BASIC: 'Yours to choose', STANDARD: 'Yours to choose', COMPLETE: 'Yours to choose' } },
  { label: 'Font style', cells: { BASIC: 'Modern', STANDARD: '3 to choose from', COMPLETE: 'All 5 to choose from' } },
  { label: 'Cover: names, monogram, date, cover photo', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Opening before the invitation (a short moving scene)', cells: { BASIC: 'Included', STANDARD: 'Included', COMPLETE: 'Included' } },
  { label: 'Premium opening video, made for your design', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on' } },
  { label: 'Countdown timer', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Ceremony & reception + Google Maps & Waze buttons', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Parents section', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Dress code + colour motif swatches', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Photos', cells: { BASIC: '1 cover photo', STANDARD: 'Gallery up to 10', COMPLETE: 'Unlimited gallery + prenup video' } },
  { label: 'RSVP', cells: { BASIC: 'Simple form', STANDARD: '+ RSVP dashboard, Excel export', COMPLETE: '+ meal choice, auto-close on your deadline' } },
  { label: 'Guest groups on the RSVP (sponsors, family, friends)', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Printable headcount sheet for your caterer or coordinator', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Entourage (ninong & ninang, sponsors, wedding party)', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Our Story / timeline', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Gift note + GCash / bank QR', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Hashtag & social', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'FAQ section', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Background music', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Program / timeline of the day', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Accommodation & travel tips', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Guest list manager (Excel import, groups, a personal link per guest)', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: "Seating chart on the guest's page", cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: true } },
  { label: 'QR check-in on event day', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: true } },
  { label: 'Guestbook / well-wishes wall', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Post-event photo sharing (guest uploads)', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Link', cells: { BASIC: '/juan-and-maria', STANDARD: '+ custom slug', COMPLETE: '+ password / private option' } },
  { label: 'Password on the link', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: true } },
  { label: 'Revisions (rounds of changes before we publish)', cells: { BASIC: '2 rounds', STANDARD: '4 rounds', COMPLETE: '6 rounds' } },
  { label: 'Changes after publishing (design included)', cells: { BASIC: 'Message us', STANDARD: 'Message us', COMPLETE: 'Message us' } },
  { label: 'Link validity', cells: { BASIC: 'Event + 30 days', STANDARD: 'Event + 6 months', COMPLETE: 'Event + 1 year' } },
];

/** What the landing page, checkout and upgrade page show. */
export const COMPARISON: ComparisonRow[] = COMPARISON_ALL.filter((r) => !r.hidden);

