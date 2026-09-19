/**
 * A place, turned into a link a phone can act on.
 *
 * Both take the family's own link where they pasted one, and fall back to a
 * search for the name and the address they typed. That order matters: a
 * pasted link points at the exact pin the family checked, and a search for
 * "Blue Leaf, 30th St" points at whatever the map thinks that is. The fall
 * back is what makes the buttons work for a family who pasted nothing, which
 * is nearly all of them.
 *
 * Here rather than in the renderer because a drawn page needs them too, and
 * a drawn page is mounted in the browser by the studio: nothing server-only
 * may be on the path.
 */
export type Place = { venue?: unknown; address?: unknown; mapsUrl?: unknown; wazeUrl?: unknown } | undefined;

const str = (data: Place, key: 'venue' | 'address' | 'mapsUrl' | 'wazeUrl'): string => {
  const v = data?.[key];
  return typeof v === 'string' ? v.trim() : '';
};

const query = (data: Place): string => [str(data, 'venue'), str(data, 'address')].filter(Boolean).join(', ');

export function mapsHref(data: Place): string {
  const given = str(data, 'mapsUrl');
  if (given) return given;
  const q = query(data);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

export function wazeHref(data: Place): string {
  const given = str(data, 'wazeUrl');
  if (given) return given;
  const q = query(data);
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : '';
}
