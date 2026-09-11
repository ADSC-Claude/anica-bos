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
