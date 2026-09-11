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
  // Every guest who accepts and leaves an address gets a confirmation of their
  // seats, and it costs the couple nothing. Free only at the top, because below
  // it the same send is the paid e-mail blast — and a package below it reaches
  // it by buying one, which is ADDON_EXTRA further down.
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
 * Add-ons that buy a feature outright, on a package that does not include it.
 *
 * Everything else in this file is a reason to move up a package; these three
 * are the exceptions, and they are exceptions for the same reason. Each is
 * wanted by a couple who want one thing rather than the whole tier — a small
 * wedding that wants the door scanned, a garden reception that wants a seating
 * chart, a family that wants the link behind a password — and telling them to
 * buy the package above to get it loses a sale they were ready to make.
 *
 * Check-in and the seating chart are Luxury's since #127; the password is
 * Signature's. Nothing here names a tier, so moving a feature between packages
 * moves who is offered the add-on with it.
 *
 * Each maps to a LIST, because two of them do not work alone. Check-in scans a
 * guest's token and seating puts a name at a table, so both need the guest
 * list and the per-guest links that carry the tokens; sold without those, a
 * couple would pay ₱1,000 for a page they can never put anybody on. So an
 * add-on grants what it needs to actually work, and the list comes with it.
 *
 * That is most of what separates the top packages from Basic, for ₱1,000 —
 * worth knowing when either price moves, and worth knowing that ₱4,500 of Basic
 * plus these two reaches what ₱7,500 of Luxury is sold for. It is not a slip:
 * there is no smaller honest version, because neither feature works alone. The Excel import is in the list for the same reason, not a
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
 * Features an add-on carries along without being the reason anybody buys it.
 *
 * Kept apart from ADDON_FEATURE above, because the two answer different
 * questions and one table cannot answer both. ADDON_FEATURE says what an add-on
 * is *for*, and its first entry decides who is offered it at all — a package
 * that already includes the headline is not sold it a second time. This one
 * says what comes with it anyway, and must not reach that rule: a comms suite
 * carries the RSVP confirmation, and Luxury already has the confirmation, but
 * Luxury still buys comms suites. Putting it in the table above would refuse
 * the sale.
 *
 * Matched by pattern rather than listed, because the campaigns are one row per
 * suite per guest band — sixteen codes for four products — and sixteen hand-typed
 * entries is sixteen chances to leave one out when a band is added. The codes
 * are parsed the same way in src/lib/campaigns.ts, which is where they get their
 * meaning; here only the shape matters.
 *
 * Why the confirmation in particular: the guest communication suites are the
 * ones that write to guests by e-mail. A couple who has paid us to e-mail their
 * guests on a schedule has paid for the wire, and the receipt a guest gets for
 * accepting goes down the same one. SMS_REMINDER_* is deliberately not here —
 * it is texts only, and it would be buying an e-mail with a text pack.
 */
export const ADDON_EXTRA: readonly { match: RegExp; features: readonly FeatureKey[] }[] = [
  { match: /^COMMS_[A-Z]+_\d+$/, features: ['rsvp.emailConfirmation'] },
];

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
 * Every gate on a feature reachable through ADDON_FEATURE or ADDON_EXTRA reads
 * this rather than hasFeature. The two stay separate because most of this codebase is
 * asking what a *tier* includes — the comparison table, the upgrade page, the
 * builder's padlocks — and that question has no invitation to ask about.
 */
export function entitled(inv: Entitled, feature: FeatureKey): boolean {
  if (hasFeature(inv.tier, feature)) return true;
  return inv.addOns.some(
    (code) =>
      ADDON_FEATURE[code]?.includes(feature) ||
      ADDON_EXTRA.some((e) => e.match.test(code) && e.features.includes(feature)),
  );
}

/** The add-on a package without this feature buys to have it anyway. */
export function addOnForFeature(feature: FeatureKey): string | undefined {
  return Object.keys(ADDON_FEATURE).find((code) => ADDON_FEATURE[code][0] === feature);
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
  // Twenty, not unlimited. The number and the word have to move together: a
  // package that says twenty and accepts a hundred is a package whose promise
  // means nothing, and one that says unlimited while an encoder is placing
  // every photo by hand was never unlimited in the way a customer would read it.
  if (hasFeature(tier, 'gallery.unlimited')) return 20;
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
  // "Prenup video" is a wedding's word for it, and this table is read by a
  // family choosing a package for a christening as readily as by a couple.
  { label: 'Photos', cells: { BASIC: '1 cover photo', STANDARD: '5 to 7 photos', COMPLETE: '10 to 15 photos + video', LUXURY: '20 photos + video' } },
  { label: 'RSVP', cells: { BASIC: 'Simple form', STANDARD: '+ RSVP dashboard, Excel export', COMPLETE: '+ meal choice, auto-close on your deadline', LUXURY: '+ meal choice, auto-close on your deadline' } },
  { label: 'E-mail confirmation to each guest who accepts', cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
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
  { label: "Seating chart on the guest's page", cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on', LUXURY: true } },
  { label: 'QR check-in on event day', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on', LUXURY: true } },
  { label: 'Guestbook / well-wishes wall', cells: { BASIC: false, STANDARD: false, COMPLETE: true, LUXURY: true } },
  { label: 'Post-event photo sharing (guest uploads)', cells: { BASIC: false, STANDARD: false, COMPLETE: false, LUXURY: true } },
  { label: 'Save the Date card (a second card, months ahead)', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: 'Add-on', LUXURY: 'Included' } },
  { label: 'Link', cells: { BASIC: '/juan-and-maria', STANDARD: '+ custom slug', COMPLETE: '+ password / private option', LUXURY: '+ password / private option' } },
  { label: 'Password on the link', cells: { BASIC: 'Add-on', STANDARD: 'Add-on', COMPLETE: true, LUXURY: true } },
  { label: 'Revisions (rounds of changes before we publish)', cells: { BASIC: '2 rounds', STANDARD: '4 rounds', COMPLETE: '6 rounds', LUXURY: '8 rounds' } },
  { label: 'Link validity', cells: { BASIC: 'Event + 30 days', STANDARD: 'Event + 6 months', COMPLETE: 'Event + 1 year', LUXURY: 'Event + 1 year' } },
];

/** What the landing page, checkout and upgrade page show. */
export const COMPARISON: ComparisonRow[] = COMPARISON_ALL.filter((r) => !r.hidden);

