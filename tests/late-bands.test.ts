/**
 * What being late costs, by how late.
 *
 * A flat charge per late arrival treats six minutes over and three hours over
 * as the same offence. The minutes were already recorded at time-in and thrown
 * away; these bands are what reads them.
 *
 * Everything here is in minutes *past the grace period*, because that is what
 * `Attendance.lateMinutes` actually stores — grace has already been subtracted
 * by the time anyone is marked late.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandFor,
  bandLabel,
  checkBands,
  parseLateBands,
  type LateBand,
} from '../src/lib/late-bands';

const LADDER: LateBand[] = [
  { from: 1, to: 15, amountCents: 5_000 },
  { from: 16, to: 45, amountCents: 10_000 },
  { from: 46, to: null, amountCents: 20_000 },
];

// ------------------------------------------------------------- which band

test('a few minutes over grace lands in the first band', () => {
  assert.equal(bandFor(LADDER, 1)?.amountCents, 5_000);
  assert.equal(bandFor(LADDER, 15)?.amountCents, 5_000);
});

test('the boundary belongs to the band that starts there', () => {
  // 15 and 16 are different mornings and different money; an off-by-one here
  // is somebody's payslip.
  assert.equal(bandFor(LADDER, 15)?.amountCents, 5_000);
  assert.equal(bandFor(LADDER, 16)?.amountCents, 10_000);
  assert.equal(bandFor(LADDER, 45)?.amountCents, 10_000);
  assert.equal(bandFor(LADDER, 46)?.amountCents, 20_000);
});

test('an open-ended band catches everything beyond it', () => {
  assert.equal(bandFor(LADDER, 200)?.amountCents, 20_000);
  assert.equal(bandFor(LADDER, 10_000)?.amountCents, 20_000);
});

test('lateness no band describes is not charged', () => {
  // The owner wrote three bands starting at 1. Zero minutes past grace is not
  // late at all, and inventing a charge for a case she did not describe is
  // taking money for a rule nobody wrote down.
  assert.equal(bandFor(LADDER, 0), null);
  assert.equal(bandFor([{ from: 10, to: 20, amountCents: 5_000 }], 5), null);
  assert.equal(bandFor([], 30), null, 'no bands at all means the flat charge applies instead');
});

// ------------------------------------------------------------- reading them

test('bands are sorted, so the ladder reads in order however it was typed', () => {
  const parsed = parseLateBands([
    { from: 46, to: null, amountCents: 20_000 },
    { from: 1, to: 15, amountCents: 5_000 },
    { from: 16, to: 45, amountCents: 10_000 },
  ]);
  assert.deepEqual(parsed.map((b) => b.from), [1, 16, 46]);
});

test('half-typed and malformed rows are dropped, not guessed at', () => {
  const parsed = parseLateBands([
    { from: 1, to: 15, amountCents: 5_000 },
    { from: 20, to: 10, amountCents: 5_000 },   // ends before it starts
    { from: 'x', to: 5, amountCents: 'y' },      // not numbers at all
    null,
    'nonsense',
  ]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].from, 1);
});

test('a missing "to" means and-upwards, not zero', () => {
  const [b] = parseLateBands([{ from: 30, amountCents: 1_000 }]);
  assert.equal(b.to, null);
  assert.equal(bandFor([b], 999)?.amountCents, 1_000);
});

test('anything that is not a list is no bands at all', () => {
  // A settings row that has never been written reads as its default, and a
  // corrupted one must not take money off anybody.
  assert.deepEqual(parseLateBands(undefined), []);
  assert.deepEqual(parseLateBands(null), []);
  assert.deepEqual(parseLateBands('[]'), [], 'a string is not a parsed array');
  assert.deepEqual(parseLateBands({ from: 1 }), []);
});

test('negative minutes and negative money are clamped away', () => {
  const [b] = parseLateBands([{ from: -5, to: 10, amountCents: -100 }]);
  assert.equal(b.from, 0);
  assert.equal(b.amountCents, 0);
});

// --------------------------------------------------------------- warnings

test('overlapping bands are called out, because the charge would be arbitrary', () => {
  const problems = checkBands([
    { from: 1, to: 20, amountCents: 5_000 },
    { from: 15, to: 40, amountCents: 10_000 },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /overlaps/);
});

test('a gap is pointed out, because a gap is silently free', () => {
  const problems = checkBands([
    { from: 1, to: 15, amountCents: 5_000 },
    { from: 30, to: null, amountCents: 10_000 },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /between 16 and 29/);
});

test('a band after an open-ended one can never apply', () => {
  const problems = checkBands([
    { from: 1, to: null, amountCents: 5_000 },
    { from: 30, to: 60, amountCents: 10_000 },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /never applies/);
});

test('a clean ladder has nothing to say about it', () => {
  assert.deepEqual(checkBands(LADDER), []);
});

// ---------------------------------------------------------------- payslip

test('a band names itself the way it should read on a payslip', () => {
  assert.equal(bandLabel(LADDER[0]), '1–15 min past grace');
  assert.equal(bandLabel(LADDER[2]), 'over 45 min past grace');
  assert.equal(bandLabel({ from: 5, to: 5, amountCents: 100 }), '5 min past grace');
});
