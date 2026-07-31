/**
 * Last call.
 *
 * The spa closes at midnight, and the booking engine used to refuse anything
 * that would still be running then — so a 9pm caller wanting a 90-minute
 * massage was turned away by the very hours the spa stays open for.
 *
 * Now those slots are offered as *requests*: someone at the desk has to agree
 * to stay. The rules that matter are which slots appear, which of them are
 * marked as needing approval, and that the two cut-offs do not eat each other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotsForDay, runsPastClosing } from '../src/lib/availability';

// Far enough ahead that the lead-time filter never interferes.
const DAY = '2027-03-05';
const NOW = new Date('2027-03-01T00:00:00Z');

const OPEN = 720; // 12:00 NN
const CLOSE = 1440; // 12:00 MN

function slots(durationMinutes: number, lastCallMinutes = 60, stepMinutes = 15) {
  return slotsForDay({
    dateKey: DAY,
    openMinute: OPEN,
    closeMinute: CLOSE,
    durationMinutes,
    stepMinutes,
    leadTimeMinutes: 60,
    lastCallMinutes,
    now: NOW,
  });
}

const last = <T,>(xs: T[]) => xs[xs.length - 1];

test('a one-hour treatment is sold right up to 11pm, and never needs approval', () => {
  const s = slots(60);
  assert.equal(last(s).minute, 1380, 'last start is 11:00 PM');
  assert.ok(s.every((x) => !x.needsApproval), 'it finishes exactly at closing, so nothing to ask');
});

test('a 90-minute treatment is still offered late, flagged for approval', () => {
  const s = slots(90);
  assert.equal(last(s).minute, 1380, 'last call is 11:00 PM whatever the length');

  // 10:30 PM + 90 = 12:00 MN exactly: finishes as the doors close, so it sells.
  const half10 = s.find((x) => x.minute === 1350)!;
  assert.equal(half10.needsApproval, false);

  // 10:45 PM + 90 runs 15 minutes over. Offered, but only as a request.
  const quarter11 = s.find((x) => x.minute === 1365)!;
  assert.equal(quarter11.needsApproval, true);

  assert.equal(last(s).needsApproval, true);
});

test('the short-treatment window is not eaten by the last-call cut-off', () => {
  // A 30-minute treatment can honestly run to 11:30 PM. If last call simply
  // capped every start at 11:00 PM, the spa would lose sellable slots it can
  // actually deliver — which is the bug the Math.max exists to prevent.
  const s = slots(30);
  assert.equal(last(s).minute, 1410, 'last start is 11:30 PM');
  assert.ok(s.every((x) => !x.needsApproval));
});

test('with last call switched off, nothing may run past closing', () => {
  const s = slots(90, 0);
  assert.equal(last(s).minute, 1350, 'back to finishing by midnight');
  assert.ok(s.every((x) => !x.needsApproval), 'no requests exist at all');
});

test('the setting is measured back from closing, so a bigger number means an earlier cut-off', () => {
  // 60 => last call 11:00 PM. 30 => 11:30 PM. 120 => 10:00 PM, which is earlier
  // than the 10:30 PM this treatment can reach unaided, so the honest cut-off
  // wins and no requests are offered at all.
  assert.equal(last(slots(90, 30)).minute, 1410, '30 minutes before midnight is 11:30 PM');
  assert.equal(last(slots(90, 60)).minute, 1380, '60 minutes before midnight is 11:00 PM');

  const narrow = slots(90, 120);
  assert.equal(last(narrow).minute, 1350, 'the last sellable start, since last call is earlier');
  assert.ok(narrow.every((x) => !x.needsApproval), 'nothing to approve inside that window');
});

test('slots step at the configured interval', () => {
  const s = slots(60, 60, 15);
  assert.equal(s[0].minute, OPEN);
  assert.equal(s[1].minute - s[0].minute, 15, 'quarter-hour starts');
  const half = slots(60, 60, 30);
  assert.equal(half[1].minute - half[0].minute, 30);
});

test('opening time is offered, not skipped', () => {
  assert.equal(slots(60)[0].minute, OPEN);
});

// ----------------------------------------------- the same rule, one booking

test('runsPastClosing agrees with the slot flags', () => {
  // 11:00 PM Manila is 15:00 UTC.
  const elevenPm = new Date(`${DAY}T15:00:00Z`);
  assert.equal(runsPastClosing(elevenPm, 60, CLOSE), false, 'finishes exactly at midnight');
  assert.equal(runsPastClosing(elevenPm, 90, CLOSE), true);

  const nineThirty = new Date(`${DAY}T13:30:00Z`); // 9:30 PM Manila
  assert.equal(runsPastClosing(nineThirty, 90, CLOSE), false);
  assert.equal(runsPastClosing(nineThirty, 180, CLOSE), true);
});

test('an earlier closing time is respected', () => {
  // A branch that shuts at 10 PM: the same 9:30 PM booking now overruns.
  const nineThirty = new Date(`${DAY}T13:30:00Z`);
  assert.equal(runsPastClosing(nineThirty, 90, 1320), true);
  assert.equal(runsPastClosing(nineThirty, 30, 1320), false);
});
