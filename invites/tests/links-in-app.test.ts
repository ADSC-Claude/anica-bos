/**
 * The two buttons a guest presses from inside Messenger.
 *
 * "the add to calendar doesnt push through on me, the google maps says
 * unsupported links."
 *
 * Both had the same shape of fault: the invitation handed the browser
 * something only a *full* browser can take. An in-app browser — Messenger's,
 * which is how nearly every guest opens an invitation sent on Messenger —
 * cannot save a download and cannot pass a page to another app. It does not
 * report either; it just does nothing, or says "unsupported link".
 *
 * So neither button may point at a file or at a link that redirects into an
 * app. Both point at pages now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapsHref, wazeHref } from '../src/lib/places';
import { googleCalendarHref, outlookHref, stampUtc } from '../src/lib/calendar';

const CHURCH = {
  venue: 'St. Gabriel the Archangel Parish Church',
  address: 'San Gabriel, Santa Maria, Bulacan',
  mapsUrl: 'https://maps.app.goo.gl/xJJV1RzuKvtnEXiw5',
  wazeUrl: 'https://www.waze.com/en/live-map/directions/ph/central-luzon/santa-maria/st.-gabriel-the-archangel-parish-church?place=ChIJLZAJ_rutlzMR-HEkE-2m85Q',
};

test('a shortened Google link is not what the button opens', () => {
  // the exact link she pasted, which is what the phone's Share button gives
  const href = mapsHref(CHURCH);
  assert.doesNotMatch(href, /goo\.gl/, 'a shortened link redirects into the Maps app, which an in-app browser refuses');
  assert.match(href, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(decodeURIComponent(href), /St\. Gabriel the Archangel Parish Church, San Gabriel, Santa Maria, Bulacan/);
});

test('a pasted link that is already a page is kept', () => {
  const full = 'https://www.google.com/maps/place/St.+Gabriel/@14.8,120.9,17z';
  assert.equal(mapsHref({ ...CHURCH, mapsUrl: full }), full, 'a full maps page carries the pin she checked, and renders');
});

test('a shortened link is still better than no button at all', () => {
  const only = { mapsUrl: CHURCH.mapsUrl };
  assert.equal(mapsHref(only), CHURCH.mapsUrl, 'with no venue or address to search for, her link is all there is');
});

test('Waze keeps the live-map page she pasted', () => {
  assert.equal(wazeHref(CHURCH), CHURCH.wazeUrl, 'waze.com is a page, not an app hand-off');
  assert.match(wazeHref({ venue: 'Shakey’s', address: 'Santa Maria' }), /^https:\/\/waze\.com\/ul\?q=/);
});

test('the calendar goes to a page, never a download', () => {
  const drawn = readFileSync('src/components/invite/drawn.tsx', 'utf8');
  assert.match(drawn, /if \(go\.to === 'calendar'\) return read\.path \? `\$\{read\.path\}\/calendar` : '';/,
    'the button opens the chooser page');
  assert.doesNotMatch(drawn, /download: ''/, 'no download attribute: an in-app browser cannot act on one');

  const route = readFileSync('src/app/[slug]/calendar.ics/route.ts', 'utf8');
  assert.match(route, /'Content-Disposition': `inline; filename/,
    'the file itself is served inline, so a phone hands it to the calendar rather than trying to save it');
});

test('the calendar links carry the event', () => {
  const start = new Date('2026-10-03T08:30:00+08:00');
  const e = { title: 'The Christening of Azriel Cayden', start, location: 'St. Gabriel, Santa Maria', url: 'https://youreinvitedto.com/christening-of-azriel-cayden' };

  const g = googleCalendarHref(e);
  assert.match(g, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  const gq = new URL(g).searchParams;
  assert.equal(gq.get('action'), 'TEMPLATE');
  assert.equal(gq.get('text'), e.title);
  // 08:30 in Manila is 00:30 UTC, and four hours long unless told otherwise
  assert.equal(gq.get('dates'), '20261003T003000Z/20261003T043000Z');
  assert.equal(gq.get('location'), e.location);
  assert.match(gq.get('details') ?? '', /youreinvitedto\.com/);

  const o = new URL(outlookHref(e)).searchParams;
  assert.equal(o.get('subject'), e.title);
  assert.equal(o.get('startdt'), start.toISOString());
});

test('a stamp is the basic UTC form both calendars read', () => {
  assert.equal(stampUtc(new Date('2026-10-03T00:30:00Z')), '20261003T003000Z');
});
