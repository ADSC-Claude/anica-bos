import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFeature, galleryLimit, tierAtLeast, nextTier, COMPARISON, COMPARISON_ALL, FUTURE_FEATURES, featureOffered, TIERS } from '../src/lib/tiers';
import { t, INTRO_PRESETS, GIFT_PRESETS, POLICY_PRESETS, RSVP_NOTE_PRESETS, preset } from '../src/lib/copy';
import { slugify, guestToken, orderReference } from '../src/lib/codes';
import { parseCsv, toCsv } from '../src/lib/csv';
import { qrSvg } from '../src/lib/qr';
import { buildIcs } from '../src/lib/ics';
import { paletteFrom, PALETTE_PRESETS, googleFontsUrl, FONT_PRESETS } from '../src/lib/theme';
import { formatTime, formatDate, manilaDateKey } from '../src/lib/datetime';

test('features unlock in order', () => {
  assert.equal(tierAtLeast('COMPLETE', 'BASIC'), true);
  assert.equal(tierAtLeast('BASIC', 'STANDARD'), false);
  assert.equal(nextTier('COMPLETE'), 'LUXURY');
  assert.equal(nextTier('LUXURY'), null, 'and there is nothing above the top');
  assert.equal(hasFeature('BASIC', 'rsvp.personalLinks'), false);
  assert.equal(hasFeature('COMPLETE', 'rsvp.personalLinks'), true);
  assert.equal(hasFeature('STANDARD', 'slug.custom'), true);
  assert.equal(hasFeature('STANDARD', 'privacy.password'), false);
  assert.equal(galleryLimit('BASIC'), 0, 'Basic has no gallery — its one photo is the cover photo');
  // Sold as ranges — five to seven, ten to fifteen — so the limit is the top
  // of the range the customer was shown.
  assert.equal(galleryLimit('STANDARD'), 7);
  assert.equal(galleryLimit('COMPLETE'), 15);
  assert.equal(galleryLimit('LUXURY'), Infinity);
  const photos = COMPARISON.find((r) => r.label === 'Photos')!;
  assert.match(String(photos.cells.STANDARD), /5 to 7/);
  assert.match(String(photos.cells.COMPLETE), /10 to 15/);
  for (const row of COMPARISON) for (const tier of TIERS) assert.notEqual(row.cells[tier], undefined, `${row.label} ${tier}`);

  // Revisions are rounds of changes before we publish — after it, an
  // invitation guests are already opening is ours to change, not the
  // customer's, so the table must not promise them a number they can spend.
  const revisions = COMPARISON.find((r) => r.label.startsWith('Revisions'));
  assert.ok(revisions, 'the table names the revision rounds');
  assert.ok(revisions!.label.includes('before we publish'), 'and says when they happen');
  assert.deepEqual([revisions!.cells.BASIC, revisions!.cells.STANDARD, revisions!.cells.COMPLETE], ['2 rounds', '4 rounds', '6 rounds'], 'a bigger package buys more of them');
  // What happens after publishing is not a row. Every answer it could give is
  // "message us", which reads as an invitation to open a conversation about an
  // invitation that is finished — and answering those costs more than the row
  // ever sold.
  assert.equal(COMPARISON.find((r) => r.label.startsWith('Changes after publishing')), undefined);

  // The guest list manager, its Excel import, the seating chart and event-day
  // check-in were built and then withheld, on the reasoning that they were too
  // much to encode for Done-For-You. A guest list is not encoding work — it is
  // the one part of an invitation only the couple can supply — so they are
  // Signature's and they are sold. Their pages are reached through
  // featureOffered, so a table that lists them while that returns false would
  // sell a link nobody can click.
  for (const feature of ['guests.manager', 'guests.import'] as const) {
    assert.equal(featureOffered(feature), true, `${feature} is offered`);
    assert.equal(hasFeature('COMPLETE', feature), true, `${feature} is Signature's`);
    assert.equal(hasFeature('STANDARD', feature), false, `${feature} is not Standard's`);
  }
  // The event-day half of the service is what Luxury sells: the chart a guest
  // looks themselves up on, the desk at the door, the album afterwards.
  for (const feature of ['seating', 'checkin', 'photoSharing', 'saveTheDate.included', 'rsvp.emailConfirmation'] as const) {
    assert.equal(featureOffered(feature), true, `${feature} is offered`);
    assert.equal(hasFeature('LUXURY', feature), true, `${feature} is Luxury's`);
    assert.equal(hasFeature('COMPLETE', feature), false, `${feature} is not Signature's`);
  }
  assert.deepEqual([...FUTURE_FEATURES], [], 'no feature key is held back — accommodation is a section, held back by its row');
  for (const label of ['Seating chart', 'QR check-in', 'Guest list manager', 'Parents section', 'FAQ section', 'Save the Date', 'E-mail confirmation']) {
    assert.ok(COMPARISON.some((r) => r.label.includes(label)), `the table names ${label}`);
  }
  // Built, and working for anyone who has it, but not drawn on the website.
  assert.ok(COMPARISON_ALL.some((r) => r.label.includes('Accommodation')), 'accommodation still exists');
  assert.equal(COMPARISON.find((r) => r.label.includes('Accommodation')), undefined, 'and is not on the table');
});

test('every phrase exists in both languages and substitutes variables', () => {
  assert.equal(t('en', 'rsvp.reserved', { n: 2 }), 'We have reserved 2 seat(s) in your honor.');
  assert.equal(t('tl', 'rsvp.reserved', { n: 2 }), 'May nakalaan pong 2 upuan para sa inyo.');
  assert.equal(t('tl', 'parents.title'), 'Mga Magulang');
  assert.equal(t('en', 'nonexistent.key' as never), 'nonexistent.key', 'a typo is visible rather than blank');
  for (const list of [INTRO_PRESETS, GIFT_PRESETS, POLICY_PRESETS, RSVP_NOTE_PRESETS]) for (const p of list) { assert.ok(p.en.length > 10); assert.ok(p.tl.length > 10); }
  assert.match(preset(GIFT_PRESETS, 'noBoxed', 'tl'), /boxed gifts/);
});

test('slugs and tokens', () => {
  assert.equal(slugify('Juan & María'), 'juan-and-maria');
  assert.equal(slugify("Sofia's 18th!!"), 'sofia-s-18th');
  assert.ok(guestToken().length >= 20);
  assert.notEqual(guestToken(), guestToken());
  assert.match(orderReference(), /^INV-[2-9A-HJ-NP-Z]{6}$/);
});

test('csv round-trips names with commas and ñ, and reads pasted tabs', () => {
  const csv = toCsv(['Name', 'Group'], [['Dela Cruz, Juan', 'Bride'], ['Señor Santos', 'Groom "the boss"']]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [['Name', 'Group'], ['Dela Cruz, Juan', 'Bride'], ['Señor Santos', 'Groom "the boss"']]);
  assert.deepEqual(parseCsv('Name\tSeats\nTita Baby\t3\n\n'), [['Name', 'Seats'], ['Tita Baby', '3']]);
});

test('qr, ics, theme and dates', () => {
  const svg = qrSvg('https://example.com/juan-and-maria');
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path d="M/);
  const ics = buildIcs({ uid: 'x', title: 'Juan & Maria; wedding', start: new Date('2026-12-12T06:00:00Z'), location: 'Manila, PH' });
  assert.ok(ics.includes('SUMMARY:Juan & Maria\\; wedding'), 'semicolons are escaped');
  assert.match(ics, /LOCATION:Manila\\, PH/);
  assert.match(ics, /DTSTART:20261212T060000Z/);
  assert.deepEqual(paletteFrom({ bg: 'red' }), PALETTE_PRESETS[0].palette, 'a bad colour falls back');
  assert.equal(paletteFrom({ ...PALETTE_PRESETS[1].palette }).accent, PALETTE_PRESETS[1].palette.accent);
  assert.match(googleFontsUrl(FONT_PRESETS[0].fonts), /family=Cormorant\+Garamond/);
  assert.equal(formatTime('14:30'), '2:30 PM');
  assert.equal(formatTime('00:05'), '12:05 AM');
  assert.equal(formatDate('2026-12-12', 'long'), 'December 12, 2026');
  assert.match(manilaDateKey(new Date('2026-12-12T20:00:00Z')), /^2026-12-13$/, 'evening UTC is the next day in Manila');
});
