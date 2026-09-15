import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starterDesign, pageKeyOf } from '../src/lib/design';
import { sampleContent } from '../src/lib/samples';
import { fieldsFor } from '../src/lib/sections';

test('a new design starts from the parts ticked, in the order they were ticked, the cover first', () => {
  const doc = starterDesign(['countdown', 'cover', 'parents', 'dressCode']);
  assert.deepEqual(doc.pages.map((p) => p.key), ['cover', 'countdown', 'parents', 'dress-code']);
  assert.deepEqual(doc.pages.map((p) => p.sections), [['cover'], ['countdown'], ['parents'], ['dressCode']]);
  // nothing is drawn by hand and no page is empty
  assert.ok(doc.pages.every((p) => !p.drawn && p.sections.length === 1));
});

test('a page is named after the part it carries, the way the form spells it', () => {
  assert.equal(pageKeyOf('dressCode'), 'dress-code');
  assert.equal(pageKeyOf('ceremony'), 'ceremony');
});

test('a sample stands in on a page laid out by its words as well as on a drawn one', () => {
  const doc = starterDesign(['cover', 'ceremony', 'countdown']);
  const anybody = sampleContent('anybody', { doc, occasion: 'WEDDING', demo: {} });
  const ceremony = anybody.ceremony as Record<string, unknown>;
  assert.ok(ceremony, 'the ceremony is filled');
  const texts = fieldsFor('ceremony', 'WEDDING').filter((f) => (f.type === 'text' || f.type === 'textarea') && !f.staff && !f.byDesign);
  assert.ok(texts.length > 0);
  for (const f of texts) assert.equal(ceremony[f.key], f.label, `${f.key} reads as its own question`);
  // the countdown counts: its switch is on and the cover has a day to count to
  assert.equal((anybody.countdown as Record<string, unknown>).enabled, true);
  const longest = sampleContent('longest', { doc, occasion: 'WEDDING', demo: {} });
  const first = texts[0];
  assert.equal(((longest.ceremony as Record<string, unknown>)[first.key] as string).length, Math.min(first.max ?? 60, 400));
  // nobody is still nobody
  assert.deepEqual(sampleContent('empty', { doc, occasion: 'WEDDING', demo: {} }), {});
  // and the demo is the demo, untouched
  const demo = { ceremony: { venue: 'San Agustin' } };
  assert.equal(sampleContent('demo', { doc, occasion: 'WEDDING', demo }), demo);
});
