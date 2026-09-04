import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFeature, galleryLimit, tierAtLeast, nextTier, COMPARISON, TIERS } from '../src/lib/tiers';
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
  assert.equal(nextTier('COMPLETE'), null);
  assert.equal(hasFeature('BASIC', 'rsvp.personalLinks'), false);
  assert.equal(hasFeature('COMPLETE', 'rsvp.personalLinks'), true);
  assert.equal(hasFeature('STANDARD', 'slug.custom'), true);
  assert.equal(hasFeature('STANDARD', 'privacy.password'), false);
  assert.equal(galleryLimit('BASIC'), 1);
  assert.equal(galleryLimit('STANDARD'), 10);
  assert.equal(galleryLimit('COMPLETE'), Infinity);
  for (const row of COMPARISON) for (const tier of TIERS) assert.notEqual(row.cells[tier], undefined, `${row.label} ${tier}`);
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
  const svg = qrSvg('https://example.com/i/juan-and-maria');
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
