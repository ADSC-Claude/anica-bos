import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The checklist is kept live in the studio as she draws, so it has to load in
 * a browser. It reaches a long way to do its job — the section definitions,
 * the field list, the occasion's own words — and any one of those could pull
 * in something server-only without `npm test` ever noticing, because that run
 * is under `--conditions=react-server` where `server-only` is an empty
 * module. This runs without that condition. The import is the test.
 */
test('the checklist loads outside a server component', async () => {
  const { pageNeeds, needCount, publishable } = await import('../../src/lib/needs');
  const { builtinDesign } = await import('../../src/lib/design');
  const doc = builtinDesign('babyblue')!;
  assert.deepEqual(pageNeeds({ doc, occasion: 'CHRISTENING' as never }), []);
  assert.equal(publishable([]), true);

  // and it still finds a fault out here, so the import is not the only thing proved
  const broken = JSON.parse(JSON.stringify(doc)) as typeof doc;
  broken.pages.find((p) => p.key === 'story')!.ground = undefined;
  const needs = pageNeeds({ doc: broken, occasion: 'CHRISTENING' as never });
  assert.equal(needCount(needs).blocks, 1);
  assert.equal(publishable(needs), false);
});

/**
 * The sample switcher runs in the studio as she draws, so it has to load in
 * a browser too. It reaches the field list and the occasion's own words to
 * find each box's cap, and `npm test` runs under `--conditions=react-server`
 * where `server-only` is an empty module and would not notice. The import is
 * the test; the assertion proves it did the work as well as loading.
 */
test('the sample switcher loads outside a server component', async () => {
  const { sampleContent } = await import('../../src/lib/samples');
  const { builtinDesign, valueAt } = await import('../../src/lib/design');
  const doc = builtinDesign('babyblue')!;
  const anybody = sampleContent('anybody', { doc, occasion: 'CHRISTENING' as never, demo: {} });
  assert.match(valueAt(anybody, { section: 'story', field: 'timeline', index: 2, sub: 'photo' }), /placeholder-photo/);
  assert.deepEqual(sampleContent('empty', { doc, occasion: 'CHRISTENING' as never, demo: { a: 1 } }), {});
});

/**
 * The two-picture import is arithmetic over a canvas's pixels, so it runs in
 * the browser and nowhere else. It reaches the document module for `place`
 * and the element types, which is exactly the reach that could quietly pull
 * something server-only in. The import is the test; the assertion proves the
 * reader came with it.
 */
test('the two-picture import loads outside a server component', async () => {
  const { framesFromDifference } = await import('../../src/lib/importing');
  const W = 200, H = 300;
  const blank = () => ({ data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H });
  const plain = blank();
  const filled = blank();
  // a quarter of the page, painted black in one of the two
  for (let y = 30; y < 180; y++) for (let x = 20; x < 120; x++) {
    const i = (y * W + x) * 4;
    filled.data[i] = 0; filled.data[i + 1] = 0; filled.data[i + 2] = 0;
  }
  assert.deepEqual(framesFromDifference(plain, filled), [{ left: 10, top: 10, width: 50, height: 50 }]);
});

/**
 * The library is drawn in the studio, so it loads in a browser. It reaches
 * the document module for the grounds the app ships and the wardrobe's own
 * manifest, and either could have pulled something server-only in without
 * `npm test` noticing.
 */
test('the library loads outside a server component', async () => {
  const { builtinPieces, shownPieces } = await import('../../src/lib/library');
  const all = builtinPieces();
  assert.equal(all.length, 128);
  // the Capiz strand is found by a word from its name and by one of its tags
  assert.equal(shownPieces(all, 'strand', 'all').length, 1);
  assert.equal(shownPieces(all, 'flowers', 'all').length, 1);
});
