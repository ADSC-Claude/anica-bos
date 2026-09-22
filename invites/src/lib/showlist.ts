/**
 * The showlist: how much of a guest wall a guest sees at once.
 *
 * Everything a guest writes and everything a guest sends is kept. These two
 * numbers are not a limit on the book or the album — they are a limit on the
 * *wall*, the handful shown on the page at any moment.
 *
 * Why cap it at all. A wall that only grows is a wall nobody reads: by the
 * reception's second hour it is eighty messages deep and a guest scrolls past
 * the lot to reach whatever comes after. And the people it fails worst are the
 * ones it is for — the guest who writes at nine in the evening lands at the
 * bottom of a page nobody reaches, so their message may as well not be there.
 *
 * So the wall holds the newest few, and a new arrival takes the place of the
 * oldest one on it. The one that leaves is not deleted and is not lost: it is
 * in the couple's Messages tab, in the album, in the export and in the
 * printed keepsake. It has simply had its turn on the wall, and the page says
 * how many more are behind it so nobody thinks the page dropped theirs.
 *
 * Three and nine, and not a round ten each. Three messages is one glance on a
 * phone — enough to see the wall is alive and being written on, short enough
 * that the page moves on. Nine photographs is a full three-by-three grid,
 * which is a shape rather than a ragged row, and the grid is drawn at nine
 * cells whether or not there are nine photographs to put in it.
 */

/** Messages on the wall at once. The rest are in the book. */
export const SHOW_MESSAGES = 3;

/** Photographs on the wall at once — a full three-by-three. */
export const SHOW_PHOTOS = 9;

/**
 * What to add below the wall when a guest opens the book.
 *
 * The wall is already showing a few, server-rendered; the book comes back
 * with everything. This is the difference — and it is computed from the ids
 * on the wall rather than by dropping the first three.
 *
 * Why not just skip the count. Between the page rendering and the guest
 * tapping, somebody else writes. The book then comes back one longer, every
 * position shifts by one, and skipping three drops a message nobody has read
 * while repeating one everybody has. At a reception where wishes arrive in
 * bursts that is not a rare race, it is the normal case.
 */
export function restOfBook<T extends { id: string }>(book: readonly T[], onTheWall: readonly string[]): T[] {
  const shown = new Set(onTheWall);
  return book.filter((entry) => !shown.has(entry.id));
}
