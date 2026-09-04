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
  COMPLETE: 'Complete',
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
  'palette.presets': 'STANDARD',
  'palette.custom': 'COMPLETE',
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

/** How many gallery photos a tier may carry. Infinity for Complete. */
export function galleryLimit(tier: Tier): number {
  if (hasFeature(tier, 'gallery.unlimited')) return Infinity;
  if (hasFeature(tier, 'gallery.10')) return 10;
  return 1;
}

/**
 * The comparison table on the landing page, row by row. Text cells are shown
 * as written; booleans become ✓ or —.
 */
export type ComparisonRow = { label: string; cells: Record<Tier, string | boolean>; group?: string };

export const COMPARISON: ComparisonRow[] = [
  { label: 'Template choice', cells: { BASIC: '1 from the Basic set', STANDARD: 'Any template', COMPLETE: 'Any template + premium designs' } },
  { label: 'Colour & font customization', cells: { BASIC: false, STANDARD: 'Palette presets', COMPLETE: 'Full custom palette + fonts' } },
  { label: 'Cover: names, monogram, date, cover photo', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Countdown timer', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Ceremony & reception + Google Maps & Waze buttons', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Parents section', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Dress code + colour motif swatches', cells: { BASIC: true, STANDARD: true, COMPLETE: true } },
  { label: 'Photos', cells: { BASIC: '1 cover photo', STANDARD: 'Gallery up to 10', COMPLETE: 'Unlimited gallery + prenup video' } },
  { label: 'RSVP', cells: { BASIC: 'Simple form', STANDARD: '+ RSVP dashboard, Excel export', COMPLETE: '+ per-guest links, reserved seats, meal choice, plus-one control, auto-close' } },
  { label: 'Entourage (ninong & ninang, sponsors, wedding party)', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Our Story / timeline', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Gift note + GCash / bank QR', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Hashtag & social', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'FAQ section', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Background music', cells: { BASIC: false, STANDARD: true, COMPLETE: true } },
  { label: 'Program / timeline of the day', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Accommodation & travel tips', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Guest list manager (Excel import, groups, reminders)', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: "Seating chart on the guest's page", cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'QR check-in on event day', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Guestbook / well-wishes wall', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Post-event photo sharing (guest uploads)', cells: { BASIC: false, STANDARD: false, COMPLETE: true } },
  { label: 'Link', cells: { BASIC: '/juan-and-maria', STANDARD: '+ custom slug', COMPLETE: '+ password / private option' } },
  { label: 'Edits after publish', cells: { BASIC: '3', STANDARD: 'Unlimited until event', COMPLETE: 'Unlimited until event' } },
  { label: 'Link validity', cells: { BASIC: 'Event + 30 days', STANDARD: 'Event + 6 months', COMPLETE: 'Event + 1 year' } },
  { label: 'Support', cells: { BASIC: 'Email', STANDARD: 'Messenger / Viber', COMPLETE: 'Priority + 1 free design tweak' } },
];
