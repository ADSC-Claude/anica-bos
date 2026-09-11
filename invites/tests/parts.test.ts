import test from 'node:test';
import assert from 'node:assert/strict';
import { partsOf, canAddPart, extraSectionsOf, type Part } from '../src/lib/parts';
import { builtinDesign } from '../src/lib/design';
import { TIER_LABELS } from '../src/lib/tiers';
import type { Occasion, Tier } from '@prisma/client';

/**
 * A part added to one invitation.
 *
 * Everything here is the pure half: which parts a screen may offer, and the
 * sentence said when one is refused. The renderer's own gate is measured in
 * design.test.ts and in the browser; what this holds is the rule that a tick
 * here never buys anything, because that is the rule with money behind it.
 */

const inv = (over: Partial<{ occasion: Occasion; tier: Tier; addOns: string[]; extraSections: string[]; saveTheDateOfId: string | null }> = {}) => ({
  occasion: 'CHRISTENING' as Occasion,
  tier: 'COMPLETE' as Tier,
  addOns: [] as string[],
  extraSections: [] as string[],
  saveTheDateOfId: null as string | null,
  ...over,
});
/** A design that draws the cover and nothing else it was asked for. */
const thin = { sections: ['cover', 'ceremony', 'rsvp'], occasion: 'CHRISTENING' as Occasion };
const state = (parts: Part[], key: string) => parts.find((p) => p.key === key)?.state;

test('a design with no ticks carries everything its occasion offers', () => {
  const parts = partsOf(inv(), { sections: [], occasion: 'CHRISTENING' });
  assert.ok(parts.length > 0);
  for (const p of parts) assert.equal(p.state, 'carried', p.key);
});

test('a part the design leaves out and the package includes can be added', () => {
  const parts = partsOf(inv(), thin);
  assert.equal(state(parts, 'cover'), 'carried');
  assert.equal(state(parts, 'ceremony'), 'carried');
  // Signature includes the programme and the guestbook
  assert.equal(state(parts, 'program'), 'addable');
  assert.equal(state(parts, 'guestbook'), 'addable');
  // a part nobody is offered at all is not a choice on any package
  assert.equal(state(parts, 'parents'), undefined);
  assert.equal(state(parts, 'faq'), undefined);
  // and the spare photographs at the end of the form have no page in any
  // design: their own form promises nothing there shows unless we place it
  assert.equal(state(parts, 'extras'), undefined);
  assert.equal(canAddPart(inv(), thin, 'extras').ok, false);
});

test('a part the package does not include is named with the package that would', () => {
  const parts = partsOf(inv({ tier: 'BASIC' }), thin);
  assert.equal(state(parts, 'gift'), 'needs-upgrade');
  assert.equal(parts.find((p) => p.key === 'gift')?.needs, 'STANDARD');
  assert.equal(state(parts, 'program'), 'needs-upgrade');
  assert.equal(parts.find((p) => p.key === 'program')?.needs, 'COMPLETE');
  // the Luxury one too: the ceiling is the package's, not the design's
  assert.equal(parts.find((p) => p.key === 'photos')?.needs, 'LUXURY');
});

test('an add-on unlocks a part without moving the package', () => {
  // The guest album is Luxury's, and the album add-on buys it on any package.
  // The tick here reads the same entitlement the builder and the album do, so
  // a couple who bought the add-on gets the page without buying the package.
  const parts = partsOf(inv({ tier: 'BASIC', addOns: ['PHOTO_SHARING'] }), thin);
  assert.equal(state(parts, 'photos'), 'addable');
  assert.equal(state(parts, 'program'), 'needs-upgrade');
  // and without the add-on it is refused, on the same package
  assert.equal(state(partsOf(inv({ tier: 'BASIC' }), thin), 'photos'), 'needs-upgrade');
});

test('a part already on this invitation can be taken off again', () => {
  const parts = partsOf(inv({ extraSections: ['program'] }), thin);
  assert.equal(state(parts, 'program'), 'added');
  assert.equal(state(parts, 'guestbook'), 'addable');
});

/**
 * Baby Blue's programme page carries the gift note too. A design with the
 * gift ticked and not the programme draws that page — for the gift — and the
 * programme is still nowhere on it, which is exactly the case a customer
 * rings up about. A drawn page is therefore not an answer to "is this part
 * drawn"; the tick is, the same one the renderer reads.
 */
test('a page drawn for another part does not count as drawing this one', () => {
  const doc = builtinDesign('babyblue')!;
  const page = doc.pages.find((p) => p.sections.includes('program'));
  assert.ok(page && page.sections.includes('gift'), 'the fixture this test rests on has moved');
  const ticks = { sections: ['cover', 'gift'], occasion: 'CHRISTENING' as Occasion };
  assert.equal(state(partsOf(inv(), ticks), 'gift'), 'carried');
  assert.equal(state(partsOf(inv(), ticks), 'program'), 'addable');
});

test('a Save the Date carries the date and nothing after it, so there is nothing to add', () => {
  const parts = partsOf(inv({ saveTheDateOfId: 'inv_1' }), thin);
  for (const key of ['program', 'guestbook', 'gift', 'gallery']) assert.equal(state(parts, key), undefined, key);
});

test('a design ticked for another occasion does not gate this occasion’s parts', () => {
  // a christening on a design whose ticks were made for weddings: the ticks
  // are read against the design's own occasion, exactly as the renderer does
  const wedding = { sections: ['cover', 'entourage'], occasion: 'WEDDING' as Occasion };
  assert.equal(state(partsOf(inv(), wedding), 'sponsors'), 'carried');
});

test('the shipped designs draw what their occasions offer, or leave it addable — never broken', () => {
  for (const layout of ['babyblue', 'capiz']) {
    const doc = builtinDesign(layout)!;
    const occasion = (layout === 'babyblue' ? 'CHRISTENING' : 'WEDDING') as Occasion;
    const parts = partsOf(inv({ occasion }), { sections: [], occasion });
    for (const p of parts) assert.equal(p.state, 'carried', `${layout}: ${p.key}`);
  }
});

test('extraSectionsOf keeps section keys and drops everything else', () => {
  assert.deepEqual(extraSectionsOf(['program', 'nonsense', 42, null, 'gift']), ['program', 'gift']);
  assert.deepEqual(extraSectionsOf(null), []);
  assert.deepEqual(extraSectionsOf('program'), []);
});

// --- the door ---------------------------------------------------------------

test('canAddPart allows a part the design leaves out and the package includes', () => {
  const ok = canAddPart(inv(), thin, 'program');
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.label, 'Program');
});

test('canAddPart refuses a part the package does not include, and says which package does', () => {
  const no = canAddPart(inv({ tier: 'BASIC' }), thin, 'program');
  assert.equal(no.ok, false);
  assert.ok(!no.ok && no.why.includes(TIER_LABELS.COMPLETE), no.ok ? '' : no.why);
  assert.ok(!no.ok && no.why.includes(TIER_LABELS.BASIC), no.ok ? '' : no.why);
  // and it says out loud that ticking it is not a way round the package
  assert.ok(!no.ok && /does not buy it/.test(no.why), no.ok ? '' : no.why);
});

test('canAddPart refuses a part already drawn, one already added, and one this occasion has not got', () => {
  const drawn = canAddPart(inv(), thin, 'ceremony');
  assert.equal(drawn.ok, false);
  assert.ok(!drawn.ok && /already drawn/.test(drawn.why));
  const twice = canAddPart(inv({ extraSections: ['program'] }), thin, 'program');
  assert.equal(twice.ok, false);
  assert.ok(!twice.ok && /already on this invitation/.test(twice.why));
  for (const key of ['entourage', 'parents', 'not-a-section', '']) {
    const no = canAddPart(inv(), thin, key);
    assert.equal(no.ok, false, key);
  }
});
