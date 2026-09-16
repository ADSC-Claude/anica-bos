import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The studio draws the pages in the browser, so the module that holds the
 * design document has to load there. `npm test` cannot prove that: it runs
 * under `--conditions=react-server`, where the `server-only` package resolves
 * to an empty module and importing it is silently fine. This script runs
 * without that condition, which is the condition a browser build is under,
 * and the import below is the whole test — `server-only` throws on sight.
 */
test('the design document loads outside a server component', async () => {
  const design = await import('../../src/lib/design');
  const doc = design.builtinDesign('babyblue');
  assert.ok(doc);
  assert.equal(doc!.v, 1);
  assert.ok(doc!.pages.length > 5);
  // and the one function that turns the document into CSS works there too
  const frame = doc!.pages.find((p) => p.key === 'story')!.elements!.find((e) => e.kind === 'photo')!;
  assert.match(design.elementStyle(frame).transform!, /rotate\(-7deg\)/);
});
