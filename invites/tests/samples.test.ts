import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinDesign, valueAt, type DesignDoc, type PhotoEl, type TextEl } from '../src/lib/design';
import { fieldOf } from '../src/lib/asks';
import { sampleContent, longestWords, SAMPLES } from '../src/lib/samples';

const doc = builtinDesign('babyblue')!;
const CH = 'CHRISTENING' as never;
const demo = { story: { line: 'A little prayer, answered', timeline: [{ title: 'Born', text: 'At dawn.', photo: '/a.jpg' }] } };

test('the demo is handed back exactly as it came, and nobody is nobody', () => {
  assert.equal(sampleContent('demo', { doc, occasion: CH, demo }), demo);
  assert.deepEqual(sampleContent('empty', { doc, occasion: CH, demo }), {});
  // four samples, each named once
  assert.equal(new Set(SAMPLES.map((s) => s.key)).size, SAMPLES.length);
});

test('anybody fills every box the document is bound to, and nothing else', () => {
  const got = sampleContent('anybody', { doc, occasion: CH, demo });
  const story = doc.pages.find((p) => p.key === 'story')!;
  // the six milestone frames and the six labels beside them
  for (let i = 0; i < 6; i++) {
    assert.match(valueAt(got, { section: 'story', field: 'timeline', index: i, sub: 'photo' }), /placeholder-photo/);
    assert.ok(valueAt(got, { section: 'story', field: 'timeline', index: i, sub: 'title' }));
  }
  // the frames counted by a filled picture line up with the frames themselves:
  // frame three shows row three, not row one
  const photos = doc.pages.find((p) => p.key === 'baby-photos')!;
  const frames = (photos.elements ?? []).filter((e) => e.kind === 'photo') as PhotoEl[];
  assert.equal(frames.length, 4);
  frames.forEach((f, i) => {
    const ref = 'asset' in f.bind ? undefined : f.bind;
    assert.ok(ref, `frame ${i + 1} binds nothing`);
    assert.match(valueAt(got, ref!), /placeholder-photo/, `frame ${i + 1}`);
  });
  assert.equal((got.gallery as { photos: unknown[] }).photos.length, 4);
  // a section the document never names is never invented
  assert.equal(got.reception, undefined);
  void story;
});

test('the longest fills each box to the exact cap a customer will meet', () => {
  const got = sampleContent('longest', { doc, occasion: CH, demo });
  const story = doc.pages.find((p) => p.key === 'story')!;
  const label = (story.elements ?? []).find((e) => e.id === 'story-label-1') as TextEl;
  const ref = label.lines[0].sources.flatMap((s) => ('bind' in s ? [s.bind] : []))[0];
  const field = fieldOf(ref, CH);
  const cap = Math.min(field?.max ?? 60, label.room ?? Number.POSITIVE_INFINITY);
  assert.ok(cap > 0 && cap < Number.POSITIVE_INFINITY, `no cap for ${ref.section}.${ref.field}`);
  assert.equal(valueAt(got, ref).length, cap);
  // it is words, not a run of one letter: the boxes have to break the way
  // real words break or the test proves nothing about wrapping
  assert.match(valueAt(got, ref), /^Maria Concepcion/);
});

test('longestWords: exactly the letters asked for, cut wherever the cap falls', () => {
  assert.equal(longestWords(0), '');
  assert.equal(longestWords(-3), '');
  assert.equal(longestWords(5), 'Maria');
  assert.equal(longestWords(8), 'Maria Co');
  for (const n of [1, 7, 23, 60, 200]) assert.equal(longestWords(n).length, n, `${n} letters`);
});

test('a sample never reaches the design, and an empty document makes nothing', () => {
  const before = JSON.stringify(doc);
  sampleContent('longest', { doc, occasion: CH, demo });
  sampleContent('anybody', { doc, occasion: CH, demo });
  assert.equal(JSON.stringify(doc), before);
  for (const kind of ['anybody', 'longest'] as const) {
    assert.deepEqual(sampleContent(kind, { doc: null, occasion: CH, demo }), {});
    assert.deepEqual(sampleContent(kind, { doc: { v: 1, pages: [] } as DesignDoc, occasion: CH, demo }), {});
  }
});
