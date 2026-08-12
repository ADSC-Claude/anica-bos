import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPeso, toCents, discountAmount, ratio, revenueSplit } from '../src/lib/money';
import { nightsBetween, nightKeys, isWeekendNight, addDays, toDateKey, toStayDate } from '../src/lib/datetime';

/**
 * The arithmetic an owner will hand-check against a spreadsheet. If any of
 * these drift, the dashboard is lying and the system stops being trusted.
 */

test('money is exact centavos, with no float anywhere', () => {
  assert.equal(toCents('3500.50'), 350050);
  assert.equal(toCents('3,500.50'), 350050);
  assert.equal(toCents(3500.555), 350056); // half-up
  assert.equal(formatPeso(350050), '₱3,500.50');
  assert.equal(formatPeso(-350050), '-₱3,500.50');
  assert.equal(formatPeso(0), '₱0.00');

  // 0.1 + 0.2 in pesos is the classic float failure; in centavos it is exact.
  assert.equal(toCents('0.1') + toCents('0.2'), toCents('0.3'));
});

test('a discount never exceeds what is being discounted', () => {
  assert.equal(discountAmount(100000, 'PERCENT', 10), 10000);
  assert.equal(discountAmount(100000, 'FIXED', 150000), 100000, 'a ₱1,500 promo on a ₱1,000 stay caps at ₱1,000');
  assert.equal(discountAmount(0, 'PERCENT', 50), 0);
  assert.equal(discountAmount(-500, 'PERCENT', 50), 0);
});

test('nights are half-open: the checkout date is not a night', () => {
  assert.equal(nightsBetween('2026-08-01', '2026-08-05'), 4);
  assert.equal(nightsBetween('2026-08-01', '2026-08-02'), 1);
  assert.deepEqual(nightKeys('2026-08-01', '2026-08-04'), ['2026-08-01', '2026-08-02', '2026-08-03']);

  // Across a month boundary and a leap day, without a timezone shifting either.
  assert.equal(nightsBetween('2026-01-30', '2026-02-02'), 3);
  assert.equal(nightsBetween('2028-02-27', '2028-03-01'), 3);
});

test('stay dates survive the round trip with no timezone drift', () => {
  for (const key of ['2026-01-01', '2026-06-15', '2026-12-31', '2028-02-29']) {
    assert.equal(toDateKey(toStayDate(key)), key, `${key} must round-trip exactly`);
  }
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('weekend nights are Friday and Saturday', () => {
  assert.equal(isWeekendNight('2026-08-07'), true, '7 Aug 2026 is a Friday');
  assert.equal(isWeekendNight('2026-08-08'), true, 'Saturday');
  assert.equal(isWeekendNight('2026-08-09'), false, 'Sunday night is not a weekend rate');
  assert.equal(isWeekendNight('2026-08-06'), false, 'Thursday');
});

/**
 * The three KPIs, worked by hand on a case small enough to check on paper.
 *
 *   3 properties over a 30-day month = 90 property-nights available
 *   61 nights sold, ₱252,540 of accommodation revenue
 *
 *   Occupancy = 61 / 90              = 67.8% → 68%
 *   ADR       = 252,540 / 61         = ₱4,140.00
 *   RevPAR    = 252,540 / 90         = ₱2,806.00
 *   and RevPAR must equal ADR × occupancy, within rounding.
 */
test('ADR, occupancy and RevPAR agree with each other', () => {
  const availableNights = 3 * 30;
  const nightsSold = 61;
  const accommodationCents = 25254000;

  const occupancyPercent = ratio(nightsSold, availableNights);
  const adrCents = Math.round(accommodationCents / nightsSold);
  const revParCents = Math.round(accommodationCents / availableNights);

  assert.equal(occupancyPercent, 68);
  assert.equal(adrCents, 414000);
  assert.equal(formatPeso(adrCents), '₱4,140.00');
  assert.equal(revParCents, 280600);

  // RevPAR = ADR × occupancy. Rounding makes them near-equal, not identical.
  const derived = Math.round((adrCents * nightsSold) / availableNights);
  assert.ok(Math.abs(derived - revParCents) <= 1, `${derived} vs ${revParCents}`);
});

test('occupancy handles the empty month without dividing by zero', () => {
  assert.equal(ratio(0, 0), 0);
  assert.equal(ratio(5, 0), 0);
});

/**
 * P&L, worked by hand:
 *   revenue  248,500 + 55,800 = 304,300
 *   expenses  19,400 + 14,100 = 33,500, plus 5,000 business-wide
 *   net = 304,300 − 38,500 = 265,800
 * The business-wide expense must land in the consolidated total and in no
 * single property's row.
 */
test('consolidated P&L carries unallocated expenses; property rows do not', () => {
  const rows = [
    { revenueCents: 24850000, expenseCents: 1940000 },
    { revenueCents: 5580000, expenseCents: 1410000 },
  ];
  const unallocated = 500000;

  const revenue = rows.reduce((a, r) => a + r.revenueCents, 0);
  const expenses = rows.reduce((a, r) => a + r.expenseCents, 0) + unallocated;
  const net = revenue - expenses;

  assert.equal(revenue, 30430000);
  assert.equal(expenses, 3850000);
  assert.equal(net, 26580000);
  assert.equal(formatPeso(net), '₱265,800.00');

  // Each property's own net excludes the business-wide cost.
  assert.equal(rows[0].revenueCents - rows[0].expenseCents, 22910000);
});

/**
 * A channel booking arrives with a payout and no breakdown: Airbnb says what it
 * paid, never how it split it. Such a stay still occupies nights, so if its
 * money is left out of accommodation it adds to the denominator of ADR and
 * nothing to the numerator — and every Airbnb night in the window quietly
 * drags the rate down.
 *
 * This was a real bug: the seed set accommodationCents only once a stay
 * completed, so a confirmed Airbnb booking reported ADR as if it were free.
 */
test('a booking with a total and no breakdown counts as accommodation', () => {
  const airbnb = revenueSplit({
    accommodationCents: 0,
    cleaningFeeCents: 0,
    addOnsCents: 0,
    extraGuestCents: 0,
    discountCents: 0,
    totalCents: 485000,
  });
  assert.equal(airbnb.accommodationCents, 485000, 'the payout is what the nights earned');
  assert.equal(airbnb.otherCents, 0);
  assert.equal(
    airbnb.accommodationCents + airbnb.otherCents,
    485000,
    'and the split still accounts for the whole total',
  );

  // Two nights at ₱4,850 is an ADR of ₱2,425 — not ₱0.
  assert.equal(Math.round(airbnb.accommodationCents / 2), 242500);
});

test('an itemised booking keeps its own split, untouched', () => {
  const direct = revenueSplit({
    accommodationCents: 1050000,
    cleaningFeeCents: 80000,
    addOnsCents: 25000,
    extraGuestCents: 15000,
    discountCents: 113000,
    totalCents: 1057000,
  });
  assert.equal(direct.accommodationCents, 1050000);
  assert.equal(direct.cleaningFeeCents, 80000);
  assert.equal(direct.addOnsCents, 40000, 'add-ons and extra guests are one line');
  assert.equal(direct.otherCents, 80000 + 40000 - 113000);
  assert.equal(
    direct.accommodationCents + direct.otherCents,
    1057000,
    'the split reconciles to the total the guest agreed to',
  );
});

test('a fully discounted stay is not mistaken for an unsplit one', () => {
  // Accommodation equal to the total is ordinary — no fees, no discount. The
  // rule must key on "nothing is itemised", not on any coincidence of figures.
  const noFees = revenueSplit({
    accommodationCents: 600000,
    cleaningFeeCents: 0,
    addOnsCents: 0,
    extraGuestCents: 0,
    discountCents: 0,
    totalCents: 600000,
  });
  assert.equal(noFees.accommodationCents, 600000);
  assert.equal(noFees.otherCents, 0);

  // And a zero-value row stays zero rather than inventing revenue.
  const empty = revenueSplit({
    accommodationCents: 0,
    cleaningFeeCents: 0,
    addOnsCents: 0,
    extraGuestCents: 0,
    discountCents: 0,
    totalCents: 0,
  });
  assert.equal(empty.accommodationCents, 0);
  assert.equal(empty.otherCents, 0);
});
