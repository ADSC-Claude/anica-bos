import test from 'node:test';
import assert from 'node:assert/strict';
import { tabsFor, currentTab } from '../src/lib/account-tabs';

/**
 * The strip across every page about one invitation: one tab per tool, the
 * ones the package does not include still there with a lock, and a Save
 * the Date's strip only the tabs a Save the Date has.
 */
const keys = (tabs: ReturnType<typeof tabsFor>) => tabs.map((t) => t.key);

test('a wedding on the top package has every tool, in the order a customer meets them', () => {
  const tabs = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'LUXURY', addOns: [], saveTheDate: false, pairId: 'std1' });
  assert.deepEqual(keys(tabs), ['invitation', 'share', 'guests', 'rsvps', 'seating', 'checkin', 'messages', 'guestbook', 'photos', 'saveTheDate', 'settings', 'guide']);
  assert.ok(tabs.every((t) => !t.locked), 'nothing locked at the top');
  assert.equal(tabs[0].href, '/account/invitations/inv1');
  assert.equal(tabs.find((t) => t.key === 'saveTheDate')?.href, '/account/invitations/std1', 'the Save the Date tab opens the other card');
});

test('the Basic package keeps the locked tools in sight, opening the upgrade page', () => {
  const tabs = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'BASIC', addOns: [], saveTheDate: false, pairId: null });
  const locked = tabs.filter((t) => t.locked).map((t) => t.key);
  assert.deepEqual(locked, ['guests', 'seating', 'checkin', 'guestbook', 'photos']);
  for (const t of tabs.filter((x) => x.locked)) assert.equal(t.href, '/account/invitations/inv1/upgrade');
  assert.ok(!keys(tabs).includes('saveTheDate'), 'no pair, no tab');
  // the open ones stay open on every package
  assert.ok(['invitation', 'share', 'rsvps', 'messages', 'settings', 'guide'].every((k) => tabs.find((t) => t.key === k && !t.locked)));
});

test('an add-on unlocks its tab the same as the package would', () => {
  const tabs = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'STANDARD', addOns: ['QR_CHECKIN'], saveTheDate: false, pairId: null });
  assert.ok(!tabs.find((t) => t.key === 'checkin')?.locked, 'check-in bought on its own');
  assert.ok(!tabs.find((t) => t.key === 'guests')?.locked, 'and the guest list that comes with it');
  assert.ok(tabs.find((t) => t.key === 'photos')?.locked, 'photos still not');
  // the seating chart is Luxury's, or the add-on's, and the add-on brings the list it needs
  const seating = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'BASIC', addOns: ['SEATING_VIEWER'], saveTheDate: false, pairId: null });
  assert.equal(seating.find((t) => t.key === 'seating')?.href, '/account/invitations/inv1/seating');
  assert.ok(!seating.find((t) => t.key === 'seating')?.locked, 'the seating chart bought on its own');
  assert.ok(!seating.find((t) => t.key === 'guests')?.locked, 'and the guest list the names come from');
  assert.ok(seating.find((t) => t.key === 'checkin')?.locked, 'check-in is not part of that');
});

test('a Save the Date has the card, its link, the way across, and nothing that collects', () => {
  const tabs = tabsFor({ id: 'std1', occasion: 'WEDDING', tier: 'LUXURY', addOns: [], saveTheDate: true, pairId: 'inv1' });
  assert.deepEqual(keys(tabs), ['invitation', 'share', 'pair', 'settings', 'guide']);
  assert.ok(!keys(tabs).includes('seating'), 'a Save the Date seats nobody');
  assert.equal(tabs[0].label, 'Save the Date');
  assert.equal(tabs.find((t) => t.key === 'pair')?.href, '/account/invitations/inv1');
});

test('the current tab is read off the path, and the old builder address is the Invitation tab', () => {
  const base = '/account/invitations/inv1';
  const tabs = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'LUXURY', addOns: [], saveTheDate: false, pairId: null });
  assert.equal(currentTab(tabs, base, base), 'invitation');
  assert.equal(currentTab(tabs, `${base}/builder`, base), 'invitation');
  assert.equal(currentTab(tabs, `${base}/rsvps`, base), 'rsvps');
  assert.equal(currentTab(tabs, `${base}/rsvps/print`, base), 'rsvps', 'a page under a tab is on that tab');
  assert.equal(currentTab(tabs, `${base}/seating`, base), 'seating');
  assert.equal(currentTab(tabs, `${base}/guide`, base), 'guide');
  assert.equal(currentTab(tabs, `${base}/upgrade`, base), null, 'the upgrade page is nobody’s tab');
  const basic = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'BASIC', addOns: [], saveTheDate: false, pairId: null });
  assert.equal(currentTab(basic, `${base}/upgrade`, base), null, 'and a locked tab does not light up on it');
});

test('an occasion with no guestbook page gets no Guestbook tab, whatever the package', () => {
  // The tab is sold by package, but the page exists by occasion: a kids'
  // birthday carries no guestbook, so an Upgrade pill for one would buy nothing.
  const kids = tabsFor({ id: 'inv1', occasion: 'KIDS_BIRTHDAY', tier: 'LUXURY', addOns: [], saveTheDate: false, pairId: null });
  assert.equal(kids.find((t) => t.key === 'guestbook'), undefined, 'no tab at all');
  assert.ok(kids.find((t) => t.key === 'photos'), 'the album is on every occasion');
  const wedding = tabsFor({ id: 'inv1', occasion: 'WEDDING', tier: 'BASIC', addOns: [], saveTheDate: false, pairId: null });
  assert.equal(wedding.find((t) => t.key === 'guestbook')?.locked, true, 'a wedding on Basic still sees the tab, locked');
});
