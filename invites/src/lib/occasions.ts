import type { Occasion } from '@prisma/client';

/**
 * The occasions, in the order they launch. Phase 1 is what the landing page
 * leads with; later phases sell at the generic package price until they get
 * their own Package rows.
 */
export type OccasionInfo = {
  key: Occasion;
  label: string;
  /** How it is said at home. Shown beside the English on the landing page. */
  tagalog: string;
  phase: 1 | 2 | 3;
  blurb: string;
  /** "the couple", "the debutante" — for copy like "message to {hosts}". */
  hostsNoun: string;
  /** Muted designs only — memorials must not look like a party. */
  muted?: boolean;
};

export const OCCASIONS: OccasionInfo[] = [
  { key: 'WEDDING', label: 'Wedding', tagalog: 'Kasal', phase: 1, blurb: 'Church, civil, Christian, INC, nikah, garden or destination — with Save the Date and Thanksgiving Mass cards.', hostsNoun: 'the couple' },
  { key: 'DEBUT', label: 'Debut', tagalog: '18th Birthday', phase: 1, blurb: '18 Roses, 18 Candles, 18 Treasures, cotillion and the debutante gallery.', hostsNoun: 'the debutante' },
  { key: 'CHRISTENING', label: 'Christening / Dedication', tagalog: 'Binyag', phase: 1, blurb: 'Long ninong and ninang lists, often combined with a 1st birthday.', hostsNoun: 'the family' },
  { key: 'KIDS_BIRTHDAY', label: "Kids' Birthday", tagalog: 'Kaarawan', phase: 1, blurb: '1st, lucky 7th and themed parties.', hostsNoun: 'the family' },
  { key: 'MILESTONE_BIRTHDAY', label: 'Milestone Birthday', tagalog: '40th · 50th · 60th · 70th', phase: 2, blurb: 'A grown-up celebration for a big number.', hostsNoun: 'the celebrant' },
  { key: 'BABY_SHOWER', label: 'Baby Shower / Gender Reveal', tagalog: 'Baby Shower', phase: 2, blurb: 'With a reveal countdown and a gift list.', hostsNoun: 'the parents-to-be' },
  { key: 'ANNIVERSARY', label: 'Anniversary / Renewal of Vows', tagalog: 'Anibersaryo', phase: 2, blurb: 'Silver, golden, and every year between.', hostsNoun: 'the couple' },
  { key: 'ENGAGEMENT', label: 'Engagement / Pamamanhikan', tagalog: 'Pamamanhikan', phase: 2, blurb: 'The dinner where two families meet.', hostsNoun: 'the couple' },
  { key: 'GRADUATION', label: 'Graduation / Thanksgiving', tagalog: 'Pasasalamat', phase: 2, blurb: 'Board passers, promotions, retirements.', hostsNoun: 'the family' },
  { key: 'COMMUNION', label: 'First Communion / Confirmation', tagalog: 'Unang Komunyon', phase: 2, blurb: 'Sponsors, the parish, and lunch after.', hostsNoun: 'the family' },
  { key: 'CORPORATE', label: 'Corporate', tagalog: 'Company event', phase: 3, blurb: 'Christmas parties, team building, launches, awards, seminars with a registration QR.', hostsNoun: 'the organisers' },
  { key: 'HOUSEWARMING', label: 'Housewarming / House Blessing', tagalog: 'Bendisyon ng Bahay', phase: 3, blurb: 'Blessing time, then lunch.', hostsNoun: 'the family' },
  { key: 'REUNION', label: 'Reunion / Despedida', tagalog: 'Reunion', phase: 3, blurb: 'Family, batch, and welcome-home for balikbayans.', hostsNoun: 'the organisers' },
  { key: 'MEMORIAL', label: 'Memorial', tagalog: 'Babang Luksa', phase: 3, blurb: '40th day and first death anniversary Thanksgiving Mass. Quiet, respectful designs only.', hostsNoun: 'the family', muted: true },
];

export const OCCASION_BY_KEY: Record<Occasion, OccasionInfo> = Object.fromEntries(
  OCCASIONS.map((o) => [o.key, o]),
) as Record<Occasion, OccasionInfo>;

export function occasionLabel(key: Occasion): string {
  return OCCASION_BY_KEY[key]?.label ?? key;
}

export const OCCASION_KEYS = OCCASIONS.map((o) => o.key) as Occasion[];

export function isOccasion(value: string): value is Occasion {
  return (OCCASION_KEYS as string[]).includes(value);
}
