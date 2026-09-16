import test from 'node:test';
import assert from 'node:assert/strict';
import { checklistFor, wordSections } from '../src/lib/checklist';
import { defaultContent, type Content } from '../src/lib/sections';

/**
 * Get started: six lines, each ticked by the invitation itself. A fresh
 * invitation ticks nothing; filling the cover ticks the cover; publishing
 * ticks the last.
 */
const fresh = (over: Partial<Parameters<typeof checklistFor>[0]> = {}) =>
  checklistFor({ id: 'inv1', occasion: 'WEDDING', content: defaultContent('WEDDING'), tier: 'LUXURY', addOns: [], status: 'DRAFT', saveTheDate: false, layout: 'capiz', done: [], ...over });

test('a fresh invitation has six lines and none of them ticked', () => {
  const lines = fresh();
  assert.deepEqual(lines.map((l) => l.key), ['cover', 'dates', 'photos', 'words', 'rsvp', 'publish']);
  assert.ok(lines.every((l) => !l.done));
  assert.ok(lines.every((l) => l.hint.length > 10), 'every line says what earns the tick');
  assert.equal(lines[0].href, '/account/invitations/inv1?section=cover');
  assert.equal(lines[5].href, '/account/invitations/inv1/share');
});

test('the cover is ticked by the required cover fields, the dates by the send-out day, the photos by a picture', () => {
  const content: Content = { ...defaultContent('WEDDING'), cover: { ...defaultContent('WEDDING').cover, brideFirst: 'Maria', groomFirst: 'Juan', date: '2026-12-12', time: '15:00', sendOut: '2026-10-01', coverPhoto: '/u/cover.jpg' } };
  const lines = fresh({ content });
  const by = Object.fromEntries(lines.map((l) => [l.key, l.done]));
  assert.equal(by.cover, true);
  assert.equal(by.dates, true);
  assert.equal(by.photos, true);
  assert.equal(by.rsvp, false, 'no deadline yet');
  // half a cover is not a cover
  const half = fresh({ content: { ...content, cover: { ...content.cover, groomFirst: '' } } });
  assert.equal(half.find((l) => l.key === 'cover')?.done, false);
});

test('the words are ticked when every writing part is filled or marked done, and point at the first that is not', () => {
  const parts = wordSections('WEDDING', 'capiz', 'LUXURY', []);
  assert.ok(parts.includes('story') && parts.includes('ceremony') && parts.includes('dressCode'), 'the parts with something to write');
  assert.ok(!parts.includes('cover') && !parts.includes('rsvp') && !parts.includes('music') && !parts.includes('extras'), 'not the ones with lines of their own or a switch');
  assert.equal(parts[0], 'story', 'in the design’s own order: Capiz tells its story first');
  const empty = fresh();
  assert.equal(empty.find((l) => l.key === 'words')?.href, '/account/invitations/inv1?section=story', 'the first part to fill');
  // every part marked done, none filled: a decision made, so ticked
  const decided = fresh({ done: parts });
  assert.equal(decided.find((l) => l.key === 'words')?.done, true);
  // all but one
  const nearly = fresh({ done: parts.filter((k) => k !== 'story') });
  const words = nearly.find((l) => l.key === 'words')!;
  assert.equal(words.done, false);
  assert.equal(words.href, '/account/invitations/inv1?section=story');
});

test('a locked part is not waited on', () => {
  const basic = wordSections('WEDDING', 'capiz', 'BASIC', []);
  assert.ok(!basic.includes('entourage'), 'entourage is from Standard');
  assert.ok(basic.includes('ceremony'));
});

test('the RSVP line wants a deadline, and publishing ticks the last line', () => {
  const content: Content = { ...defaultContent('WEDDING'), rsvp: { ...defaultContent('WEDDING').rsvp, deadline: '2026-11-30' } };
  assert.equal(fresh({ content }).find((l) => l.key === 'rsvp')?.done, true);
  assert.equal(fresh({ status: 'PUBLISHED' }).find((l) => l.key === 'publish')?.done, true);
});

test('a Save the Date has three lines and the publish line', () => {
  const lines = fresh({ saveTheDate: true });
  assert.deepEqual(lines.map((l) => l.key), ['cover', 'dates', 'photos', 'publish']);
});
