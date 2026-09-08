/**
 * A collection is a colour family that cuts across occasions — the way a
 * couple actually shops ("show me the white ones"), rather than the way the
 * database is organised. A template belongs to at most one; templates with
 * none simply do not appear in the collection strip.
 *
 * The White Collection launches first and is wedding-only. The rest are
 * declared here so the gallery, the admin dropdown and the seed all read from
 * one list, but a collection with no published templates is never shown.
 */
export type CollectionInfo = {
  key: string;
  label: string;
  /** The line under the heading in the gallery. */
  tagline: string;
  /** Three colours, shown as dots beside the name. */
  swatch: [string, string, string];
};

export const COLLECTIONS: CollectionInfo[] = [
  { key: 'white', label: 'The White Collection', tagline: 'Ivory, cream and warm white. Nothing loud, nothing dated.', swatch: ['#fdfbf7', '#e8e0d3', '#c2a878'] },
  { key: 'blush', label: 'The Blush Collection', tagline: 'Soft pink, champagne and gold.', swatch: ['#fbf4f2', '#e7cfc9', '#d3b06c'] },
  { key: 'garden', label: 'The Garden Collection', tagline: 'Sage, olive and emerald for a Tagaytay afternoon.', swatch: ['#f5f8f5', '#c3d0be', '#1e5c47'] },
  { key: 'midnight', label: 'The Midnight Collection', tagline: 'Navy, black and champagne for an evening reception.', swatch: ['#1f2a3d', '#3b4a63', '#c8ad7f'] },
  { key: 'filipiniana', label: 'Filipino Theme', tagline: 'Capiz, piña and gold. For a wedding that looks like home.', swatch: ['#f6f1e6', '#c9a24a', '#233b8a'] },
  { key: 'babyblue', label: 'Baby Blue Theme', tagline: 'Sky, clouds, a dove and baby’s breath. For a christening, soft as a blanket.', swatch: ['#eef3f9', '#b7cde8', '#ffffff'] },
];

export const COLLECTION_BY_KEY: Record<string, CollectionInfo> = Object.fromEntries(
  COLLECTIONS.map((c) => [c.key, c]),
);

export const COLLECTION_KEYS = COLLECTIONS.map((c) => c.key);

export function isCollection(value: string): boolean {
  return COLLECTION_KEYS.includes(value);
}

export function collectionLabel(key: string): string {
  return COLLECTION_BY_KEY[key]?.label ?? '';
}

/** The collections that have at least one template here, in declared order. */
export function collectionsPresent(keys: string[]): CollectionInfo[] {
  const seen = new Set(keys.filter(Boolean));
  return COLLECTIONS.filter((c) => seen.has(c.key));
}
