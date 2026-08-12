/**
 * The bands as they reach a payslip.
 *
 * `tests/late-bands.test.ts` proves which band a given lateness falls in.
 * This proves what payroll does with that: three late mornings of differing
 * severity charged three different amounts and itemised separately, and a spa
 * that has not written any bands keeping the flat charge it always had.
 *
 * Against `lateDeductionLines` rather than the whole payslip builder, because
 * payroll settings are global rather than per-branch: a test that wrote its
 * own would change the arithmetic under every other test in the suite. That
 * is not hypothetical — a leftover global Holiday row has already made this
 * suite flaky once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lateDeductionLines } from '../src/lib/payroll';
import type { LateBand } from '../src/lib/late-bands';

/** ₱50, ₱100, ₱200 for a little late, quite late and very late. */
const BANDS: LateBand[] = [
  { from: 1, to: 15, type: 'FIXED', amountCents: 5_000 },
  { from: 16, to: 45, type: 'FIXED', amountCents: 10_000 },
  { from: 46, to: null, type: 'FIXED', amountCents: 20_000 },
];

const FLAT = { lateBands: [], lateDeductionType: 'FIXED' as const, lateDeductionValue: 5_000 };
const BANDED = { ...FLAT, lateBands: BANDS };

/** Three mornings: barely late, properly late, and very late indeed. */
const THREE = [{ lateMinutes: 5 }, { lateMinutes: 20 }, { lateMinutes: 90 }];

const total = (lines: { amountCents: number }[]) =>
  -lines.reduce((sum, l) => sum + l.amountCents, 0);

test('each late morning is charged by how late it was', () => {
  const lines = lateDeductionLines(THREE, BANDED, 20_000);
  assert.equal(total(lines), 35_000, '₱50 + ₱100 + ₱200');
});

test('the payslip separates them, so the figure can be argued with', () => {
  const lines = lateDeductionLines(THREE, BANDED, 20_000);

  assert.equal(lines.length, 3, 'one line per band used');
  assert.ok(lines.some((l) => /1–15 min past grace/.test(l.label)));
  assert.ok(lines.some((l) => /16–45 min past grace/.test(l.label)));
  assert.ok(lines.some((l) => /over 45 min past grace/.test(l.label)));
  assert.ok(lines.every((l) => l.kind === 'late'));
});

test('two mornings in the same band share one line', () => {
  const lines = lateDeductionLines([{ lateMinutes: 3 }, { lateMinutes: 9 }], BANDED, 20_000);

  assert.equal(lines.length, 1);
  assert.match(lines[0].label, /^2 late arrival\(s\), 1–15 min past grace/);
  assert.equal(-lines[0].amountCents, 10_000, 'two at ₱50');
});

test('with no bands set, the flat charge is untouched', () => {
  // The whole point of defaulting to empty: nobody's payroll changes until
  // the owner writes a ladder.
  const lines = lateDeductionLines(THREE, FLAT, 20_000);

  assert.equal(lines.length, 1);
  assert.equal(total(lines), 15_000, '3 × ₱50 regardless of how late');
  assert.match(lines[0].label, /3 late arrival\(s\)/);
});

test('banded and flat disagree, which is the whole feature', () => {
  assert.equal(total(lateDeductionLines(THREE, FLAT, 20_000)), 15_000);
  assert.equal(total(lateDeductionLines(THREE, BANDED, 20_000)), 35_000);
});

test('a percentage flat charge still works off the daily rate', () => {
  const lines = lateDeductionLines(
    [{ lateMinutes: 30 }],
    { lateBands: [], lateDeductionType: 'PERCENT', lateDeductionValue: 25 },
    20_000,
  );
  assert.equal(total(lines), 5_000, '25% of a ₱200 day');
});

test('lateness outside every band costs nothing', () => {
  // Bands starting at 16 leave 1–15 uncharged. That is the owner's choice,
  // and payroll must not quietly fill the gap.
  const lines = lateDeductionLines(
    [{ lateMinutes: 5 }],
    { ...FLAT, lateBands: [{ from: 16, to: null, type: 'FIXED', amountCents: 10_000 }] },
    20_000,
  );
  assert.deepEqual(lines, []);
});

test('nobody late means no line at all', () => {
  assert.deepEqual(lateDeductionLines([], BANDED, 20_000), []);
  assert.deepEqual(lateDeductionLines([], FLAT, 20_000), []);
});

test('a band worth nothing does not clutter the payslip with a zero', () => {
  const lines = lateDeductionLines(
    [{ lateMinutes: 5 }],
    { ...FLAT, lateBands: [{ from: 1, to: 15, type: 'FIXED', amountCents: 0 }] },
    20_000,
  );
  assert.deepEqual(lines, [], 'a warning band charges nothing and says nothing');
});

// ------------------------------------------------- percentages, per person

test('a percentage band is worked out against that day\'s allowance', () => {
  const lines = lateDeductionLines(
    [{ lateMinutes: 90 }],
    { ...FLAT, lateBands: [{ from: 46, to: null, type: 'PERCENT', amountCents: 50 }] },
    20_000,
  );
  assert.equal(total(lines), 10_000, 'half of a ₱200 day');
});

test('the same ladder means different money for different people', () => {
  // A therapist on ₱200 and a receptionist on ₱400 should both lose half a
  // day for the same offence, not both lose ₱100.
  const ladder = { ...FLAT, lateBands: [{ from: 1, to: null, type: 'PERCENT' as const, amountCents: 50 }] };

  assert.equal(total(lateDeductionLines([{ lateMinutes: 5 }], ladder, 20_000)), 10_000);
  assert.equal(total(lateDeductionLines([{ lateMinutes: 5 }], ladder, 40_000)), 20_000);
});

test('fixed and percentage rungs mix on one ladder', () => {
  // The shape the owner actually asked for: a token amount for slipping past
  // grace, real money for the rest of the morning gone.
  const mixed = {
    ...FLAT,
    lateBands: [
      { from: 1, to: 15, type: 'FIXED' as const, amountCents: 5_000 },
      { from: 16, to: null, type: 'PERCENT' as const, amountCents: 50 },
    ],
  };
  const lines = lateDeductionLines([{ lateMinutes: 5 }, { lateMinutes: 90 }], mixed, 20_000);

  assert.equal(lines.length, 2);
  assert.equal(total(lines), 5_000 + 10_000, '₱50 then half a day');
});

test('a percentage over 100 is the owner\'s business, not the code\'s', () => {
  // Nothing here caps it: a spa that wants a day and a half off for a
  // catastrophic no-show-until-closing has said so, and silently clamping
  // would be overruling her.
  const lines = lateDeductionLines(
    [{ lateMinutes: 300 }],
    { ...FLAT, lateBands: [{ from: 1, to: null, type: 'PERCENT', amountCents: 150 }] },
    20_000,
  );
  assert.equal(total(lines), 30_000);
});
