import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents,
  formatPeso,
  centsToDecimalString,
  discountAmount,
  percentOf,
} from '../src/lib/money';
import {
  manilaDateKey,
  businessDate,
  manilaInstant,
  minutesToLabel,
  monthBounds,
  addDaysToKey,
  addMonthsToKey,
  daysUntil,
  isBirthdayMonth,
} from '../src/lib/datetime';
import { suggestThreshold } from '../src/lib/retention';

test('money is exact in centavos', () => {
  assert.equal(toCents('1234.50'), 123450);
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3), 'no float drift');
  assert.equal(toCents('₱1,234.56'), 123456);
  assert.equal(formatPeso(123450), '₱1,234.50');
  assert.equal(formatPeso(-5000), '-₱50.00');
  assert.equal(formatPeso(5), '₱0.05');
  assert.equal(centsToDecimalString(123450), '1234.50');
  assert.equal(centsToDecimalString(-99), '-0.99');
});

test('discounts never exceed the base and round half-up', () => {
  assert.equal(discountAmount(65000, 'PERCENT', 10), 6500);
  assert.equal(discountAmount(65000, 'PERCENT', 20), 13000);
  assert.equal(discountAmount(1000, 'FIXED', 5000), 1000, 'clamped to the base');
  assert.equal(discountAmount(0, 'PERCENT', 50), 0);
  assert.equal(discountAmount(33333, 'PERCENT', 15), 5000, 'rounds to the nearest centavo');
  assert.equal(percentOf(65000, 25), 16250);
});

test('stacked discounts apply sequentially on the running total', () => {
  // Member 10% then a weekday promo 15% on ₱1,000.
  let running = 100000;
  const first = discountAmount(running, 'PERCENT', 10);
  running -= first;
  const second = discountAmount(running, 'PERCENT', 15);
  running -= second;

  assert.equal(first, 10000);
  assert.equal(second, 13500, '15% of the ₱900 remaining, not of the original ₱1,000');
  assert.equal(running, 76500);
});

test('Manila dates bucket correctly across the UTC boundary', () => {
  // 30 Jul 2026 23:30 Manila == 15:30 UTC the same day.
  const lateEvening = manilaInstant('2026-07-30', 23 * 60 + 30);
  assert.equal(lateEvening.toISOString(), '2026-07-30T15:30:00.000Z');
  assert.equal(manilaDateKey(lateEvening), '2026-07-30');

  // 00:30 UTC on 31 Jul is still 31 Jul 08:30 in Manila.
  const earlyUtc = new Date('2026-07-31T00:30:00.000Z');
  assert.equal(manilaDateKey(earlyUtc), '2026-07-31');

  // 16:30 UTC on 30 Jul is already 31 Jul in Manila.
  const afterMidnightManila = new Date('2026-07-30T16:30:00.000Z');
  assert.equal(manilaDateKey(afterMidnightManila), '2026-07-31');

  assert.equal(businessDate(lateEvening).toISOString(), '2026-07-30T00:00:00.000Z');
});

test('operating hours render as the spa states them', () => {
  assert.equal(minutesToLabel(720), '12:00 PM');
  assert.equal(minutesToLabel(1440), '12:00 MN');
  assert.equal(minutesToLabel(750), '12:30 PM');
  assert.equal(minutesToLabel(0), '12:00 AM');
  assert.equal(minutesToLabel(1380), '11:00 PM');
});

test('date helpers handle month ends and leap years', () => {
  assert.deepEqual(monthBounds('2026-02'), { fromKey: '2026-02-01', toKey: '2026-02-28' });
  assert.deepEqual(monthBounds('2028-02'), { fromKey: '2028-02-01', toKey: '2028-02-29' });
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
  assert.equal(addMonthsToKey('2026-01', -1), '2025-12');
  assert.equal(daysUntil(new Date('2026-08-05T00:00:00Z'), new Date('2026-07-30T05:00:00Z')), 6);
});

test('birthday month is compared in Manila time', () => {
  const july = new Date('2026-07-15T00:00:00Z');
  assert.equal(isBirthdayMonth(new Date('1990-07-02T00:00:00Z'), july), true);
  assert.equal(isBirthdayMonth(new Date('1990-08-02T00:00:00Z'), july), false);
  assert.equal(isBirthdayMonth(null, july), false);
});

test('retention threshold adapts to each client rhythm', () => {
  // A three-week regular is flagged at six weeks.
  assert.equal(suggestThreshold(21, 60), 42);
  // A quarterly visitor gets a longer leash, capped at a year.
  assert.equal(suggestThreshold(200, 60), 365);
  // Very frequent visitors still get a two-week floor.
  assert.equal(suggestThreshold(3, 60), 14);
  // Unknown rhythm falls back to the business-wide setting.
  assert.equal(suggestThreshold(null, 60), 60);
});
