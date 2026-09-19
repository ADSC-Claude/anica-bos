import test from 'node:test';
import assert from 'node:assert/strict';
import { builderPropsFor, type BuilderPropsInput } from '../src/lib/builder-props';
import { defaultContent, emptySection, sectionOrder, SECTION_BY_KEY, SAVE_THE_DATE_SECTIONS, rows } from '../src/lib/sections';

/**
 * The form's props, worked out from the invitation row alone: the parts in
 * the design's order, the fields for the role asking, the window as strings
 * a server action can carry, and the part's stored value laid over an empty
 * form so every box has something to hold.
 */
const inv = (over: Partial<BuilderPropsInput> = {}): BuilderPropsInput => ({
  id: 'inv1',
  slug: 'juan-and-maria',
  status: 'DRAFT',
  occasion: 'WEDDING',
  tier: 'LUXURY',
  addOns: [],
  language: 'en',
  content: defaultContent('WEDDING'),
  eventAt: null,
  saveTheDateOfId: null,
  template: { layout: 'capiz', design: null },
  ...over,
});

test('the parts come in the design’s order, and the current part falls back to the first that is open', () => {
  const p = builderPropsFor('CUSTOMER', inv());
  assert.deepEqual(p.sections.map((s) => s.key), sectionOrder('WEDDING', 'capiz').filter((k) => !SECTION_BY_KEY[k].hidden));
  assert.equal(p.sections[1].key, 'story', 'Capiz tells its story first');
  assert.equal(p.current, 'cover', 'nothing asked for: the first part');
  assert.equal(builderPropsFor('CUSTOMER', inv(), 'story').current, 'story');
  assert.equal(builderPropsFor('CUSTOMER', inv(), 'nonsense').current, 'cover', 'a part that is not there: the first');
  // a part the package has not got is not opened by asking for it
  const basic = builderPropsFor('CUSTOMER', inv({ tier: 'BASIC' }), 'gallery');
  assert.equal(basic.sections.find((s) => s.key === 'gallery')?.unlocked, false);
  assert.equal(basic.sections.find((s) => s.key === 'gallery')?.minTier, 'STANDARD');
  assert.equal(basic.current, 'cover');
  assert.equal(p.slug, 'juan-and-maria');
  assert.equal(p.status, 'DRAFT');
  assert.equal(p.tier, 'LUXURY');
});

test('staff see the fixed writings and a customer does not; the rest of the form is the same', () => {
  const staff = builderPropsFor('ADMIN', inv(), 'cover');
  const customer = builderPropsFor('CUSTOMER', inv(), 'cover');
  assert.ok(staff.fields.some((f) => f.key === 'intro' && f.staff), 'the intro wording is ours');
  assert.ok(!customer.fields.some((f) => f.staff), 'none of ours on the customer’s form');
  assert.deepEqual(customer.fields.map((f) => f.key), staff.fields.filter((f) => !f.staff).map((f) => f.key));
  assert.ok(builderPropsFor('ENCODER', inv(), 'cover').fields.some((f) => f.staff), 'an encoder is staff too');
  // the media field every part carries is nobody's until a design draws a frame for it
  assert.ok(!staff.fields.some((f) => f.byDesign));
});

test('a Save the Date has two parts, and its cover no opening', () => {
  const p = builderPropsFor('CUSTOMER', inv({ saveTheDateOfId: 'inv0' }));
  assert.deepEqual(p.sections.map((s) => s.key), [...SAVE_THE_DATE_SECTIONS]);
  assert.equal(p.current, 'cover');
  assert.ok(!p.fields.some((f) => f.key === 'opening' || f.key === 'envelope'), 'no levers connected to nothing');
  assert.ok(builderPropsFor('CUSTOMER', inv(), 'cover').fields.some((f) => f.key === 'opening'), 'the full card keeps them');
});

test('the photo limit is always a number: the page’s frames where it has them, the package’s cap where it has not', () => {
  const capiz = builderPropsFor('CUSTOMER', inv(), 'gallery');
  assert.ok(Number.isFinite(capiz.listLimits.photos) && capiz.listLimits.photos > 0);
  const babyblue = builderPropsFor('CUSTOMER', inv({ occasion: 'CHRISTENING', content: defaultContent('CHRISTENING'), template: { layout: 'babyblue', design: null } }), 'gallery');
  assert.equal(babyblue.listLimits.photos, 4, 'four polaroids and that is the page');
  // and it survives the trip through a server action as the same number
  assert.equal(JSON.parse(JSON.stringify(babyblue)).listLimits.photos, 4);
  assert.equal(JSON.parse(JSON.stringify(capiz)).listLimits.photos, capiz.listLimits.photos);
});

test('the window is carried as strings, and only where there is a date', () => {
  assert.equal(builderPropsFor('CUSTOMER', inv()).window, null, 'no date, no window');
  const far = builderPropsFor('CUSTOMER', inv({ eventAt: new Date('2099-12-12T06:00:00Z') })).window!;
  assert.equal(far.closesAt, '2099-11-21T06:00:00.000Z');
  assert.equal(far.finalAt, '2099-11-28T06:00:00.000Z');
  assert.equal(far.closed, false);
  // The window binds an invitation the customer has handed over, not one
  // they are still building — a date long past does not lock a draft.
  const past = builderPropsFor('CUSTOMER', inv({ eventAt: new Date('2020-12-12T06:00:00Z') })).window!;
  assert.equal(past.closed, false, 'still being built, so still open');
  assert.equal(typeof past.closesAt, 'string');
  const over = builderPropsFor('CUSTOMER', inv({
    eventAt: new Date('2020-12-12T06:00:00Z'),
    content: { progress: { completedAt: '2020-01-01T00:00:00.000Z' } },
  })).window!;
  assert.equal(over.closed, true, 'marked complete and past the date, so closed');
});

test('the part’s value is laid over an empty form, so every box has something to hold', () => {
  const p = builderPropsFor('CUSTOMER', inv({ content: { cover: { brideFirst: 'Maria' } } }), 'cover');
  assert.equal(p.initial.brideFirst, 'Maria');
  assert.equal(p.initial.groomFirst, '', 'a box the content has no word for is empty, not missing');
  for (const k of Object.keys(emptySection(p.fields))) assert.ok(k in p.initial, `${k} is on the form`);
  // an old shape is read forward on the way in, as everywhere else
  const old = builderPropsFor('CUSTOMER', inv({ content: { entourage: { bestMan: 'Miguel Angelo Dela Cruz' } } }), 'entourage');
  assert.deepEqual(rows(old.initial, 'bestMen'), [{ name: 'Miguel Angelo Dela Cruz' }]);
  // content that is not an object is an empty card, not a crash
  assert.equal(builderPropsFor('CUSTOMER', inv({ content: null }), 'cover').initial.brideFirst, '');
});

test('progress, language and look are read off the content column', () => {
  const p = builderPropsFor('CUSTOMER', inv({
    language: 'tl',
    content: { ...defaultContent('WEDDING'), progress: { done: ['cover', 'rsvp'], completedAt: '2026-08-01T00:00:00.000Z' }, theme: { lookKey: 'serif' } },
  }), 'story');
  assert.deepEqual(p.done, ['cover', 'rsvp']);
  assert.equal(p.completedAt, '2026-08-01T00:00:00.000Z');
  assert.equal(p.lang, 'tl');
  assert.equal(p.lookKey, 'serif');
  assert.equal(p.hidesWhenEmpty, true, 'a story left blank is a page that is not there');
  assert.equal(builderPropsFor('CUSTOMER', inv({ language: 'fr' })).lang, 'en', 'anything but Tagalog is English');
  const bare = builderPropsFor('CUSTOMER', inv(), 'cover');
  assert.deepEqual(bare.done, []);
  assert.equal(bare.completedAt, null);
  assert.equal(bare.lookKey, '');
  assert.equal(bare.hidesWhenEmpty, false, 'the cover is the invitation');
});
