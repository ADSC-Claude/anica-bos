/**
 * What sits behind the frame in the Moment section.
 *
 * A couple's own photograph is the first choice, and the encoder can swap it
 * at any time. But a snapshot often fights a design built from capiz, wax and
 * warm ivory — wrong light, wrong crop, a stranger in the background — and the
 * honest answer then is not to force it. These are the alternative: painted
 * scenes in the same hand as the frame around them.
 *
 * Every one of them is somewhere in the Philippines. A couple marrying in
 * Batangas should not be handed a lake in Lombardy because the illustration
 * happened to be pretty; the point of the section is that the view behind the
 * arch is theirs.
 *
 * `url` is blank until the artwork for that scene exists. A preset with no
 * artwork is never offered, so this list can be written ahead of the painting.
 */
export type Backdrop = {
  key: string;
  label: string;
  /** Where it is, said the way a couple would say it. */
  place: string;
  /** The prompt brief, kept with the entry so a re-paint matches the set. */
  brief: string;
  url: string;
};

export const BACKDROPS: Backdrop[] = [
  { key: 'elnido', label: 'Lagoon at golden hour', place: 'El Nido, Palawan', url: '', brief: 'Karst cliffs rising from still turquoise water, a wooden banca moored in the foreground, low sun. Coloured pencil and watercolour, warm ivory sky.' },
  { key: 'batangas', label: 'Coast at sunset', place: 'Batangas', url: '', brief: 'Calm bay, headland, coconut palms leaning over a stone balustrade, sun low on the water. Coloured pencil and watercolour, warm ivory and soft coral.' },
  { key: 'taal', label: 'Lake and volcano', place: 'Tagaytay', url: '', brief: 'Taal Lake at dawn seen from the ridge, the island volcano soft in haze, pale blue water. Coloured pencil and watercolour.' },
  { key: 'boracay', label: 'White sand and paraw', place: 'Boracay, Aklan', url: '', brief: 'White beach, a paraw sailboat with its outriggers, pale turquoise shallows, late afternoon. Coloured pencil and watercolour.' },
  { key: 'bohol', label: 'The hills', place: 'Bohol', url: '', brief: 'Chocolate Hills in soft green and gold, a low mist between them, wide sky. Coloured pencil and watercolour.' },
  { key: 'banaue', label: 'Rice terraces', place: 'Ifugao', url: '', brief: 'Flooded rice terraces stepping down a mountainside, catching the sky, pine ridge behind. Coloured pencil and watercolour.' },
  { key: 'sagada', label: 'Pines and mist', place: 'Sagada, Mountain Province', url: '', brief: 'Pine ridge in morning mist, cool grey-green, a valley falling away. Coloured pencil and watercolour, quiet and cool.' },
  { key: 'intramuros', label: 'Capiz windows', place: 'Intramuros, Manila', url: '', brief: 'A wall of sliding capiz shell windows in a wooden grid, warm light behind them, adobe stone. Coloured pencil and watercolour.' },
  { key: 'capiz', label: 'Capiz, no scene', place: 'Plain', url: '', brief: 'Overlapping capiz shell discs edged in thin gold, no landscape, no horizon. A texture rather than a view.' },
];

export const BACKDROP_BY_KEY: Record<string, Backdrop> = Object.fromEntries(BACKDROPS.map((b) => [b.key, b]));

/** Only the ones that have been painted. A preset with no art is not a choice. */
export function availableBackdrops(): Backdrop[] {
  return BACKDROPS.filter((b) => b.url);
}

export function isBackdrop(value: string): boolean {
  return BACKDROPS.some((b) => b.key === value);
}

/**
 * What actually goes behind the frame: the couple's photograph if they gave
 * one, else the painted scene they picked, else nothing — and nothing is a
 * real answer, leaving the frame holding the page's own colour.
 */
export function resolveBackdrop(photo: string, preset: string): { url: string; kind: 'photo' | 'painted' | 'none' } {
  if (photo) return { url: photo, kind: 'photo' };
  const painted = BACKDROP_BY_KEY[preset];
  if (painted?.url) return { url: painted.url, kind: 'painted' };
  return { url: '', kind: 'none' };
}
