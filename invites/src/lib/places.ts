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

/*
 * A shortened Google link is a door to the app, not a page.
 *
 * "the google maps says unsupported links". Her pin was pasted as
 * `maps.app.goo.gl/…`, which is what the Share button on the phone gives
 * you — and which answers a phone by redirecting to the Maps *app*. A
 * normal browser follows that happily. An in-app browser — Messenger's,
 * which is how her guests open the invitation — is not allowed to hand a
 * page over to another app, and says "unsupported link" instead.
 *
 * So a shortened link is not used as the button's target. The long form,
 * `google.com/maps/search/?api=1&query=…`, is Google's own cross-platform
 * URL: it is a real page, it renders inside any browser, and Google's page
 * then offers the app to whoever has it. The pin is found by name and
 * address, which for "St. Gabriel the Archangel Parish Church, San Gabriel,
 * Santa Maria, Bulacan" is the same pin she shared.
 *
 * A pasted link that is already a full maps page is kept as it is: that is
 * a page too, and it carries whatever she checked.
 */
const SHORTENED = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.google\.com\/maps\?cid=)/i;

export function mapsHref(data: Place): string {
  const given = str(data, 'mapsUrl');
  if (given && !SHORTENED.test(given)) return given;
  const q = query(data);
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  // nothing to search for: her shortened link is better than no button
  return given;
}

export function wazeHref(data: Place): string {
  const given = str(data, 'wazeUrl');
  if (given) return given;
  const q = query(data);
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes` : '';
}
