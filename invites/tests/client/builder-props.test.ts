import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The form's props are answered by a server action, but the module that
 * works them out must not be server-only: the studio is a client and the
 * type it reads back is this module's, and a host that wanted to compute
 * them in the browser must be able to. It reaches the section definitions,
 * the design document and the asks — any of which could pull in something
 * server-only without `npm test` noticing, because that run is under
 * `--conditions=react-server` where `server-only` is an empty module. This
 * runs without that condition. The import is the test; the assertion proves
 * it did the work as well as loading.
 */
test('the form’s props load outside a server component', async () => {
  const { builderPropsFor } = await import('../../src/lib/builder-props');
  const { defaultContent } = await import('../../src/lib/sections');
  const p = builderPropsFor('CUSTOMER', {
    id: 'inv1', slug: 'juan-and-maria', status: 'DRAFT', occasion: 'WEDDING' as never, tier: 'LUXURY' as never, addOns: [], language: 'en',
    content: defaultContent('WEDDING' as never), eventAt: null, saveTheDateOfId: null, template: { layout: 'capiz', design: null },
  }, 'story');
  assert.equal(p.current, 'story');
  assert.ok(p.fields.length > 0);
});
