/**
 * The opening offer: first twenty customers, twenty per cent off.
 *
 * The rule that matters is not the arithmetic, it is that one row decides
 * both numbers. The packages promise a price and the checkout charges one,
 * and a shop where those two differ is worse than a shop with no offer.
 *
 * So: the badge and the bill read the same coupon, the offer ends by itself
 * when the twentieth seat goes, and running out never blocks a sale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchOffer, offerPrice, offerHeadline, offerLeftLine, LAUNCH_CODE, LAUNCH_PERCENT, LAUNCH_SEATS } from '../src/lib/launch';
import { quote, type CouponLike } from '../src/lib/pricing';

const row = (over: Partial<CouponLike> = {}): CouponLike => ({
  code: LAUNCH_CODE, type: 'PERCENT', value: LAUNCH_PERCENT, minSpendCents: 0,
  expiresAt: null, usageLimit: LAUNCH_SEATS, usedCount: 0, active: true, ...over,
});

const PKG = { code: 'SIG', name: 'Signature', tier: 'COMPLETE' as const, priceCents: 999_900, dfyFeeCents: 0, conciergeFeeCents: 0 };

test('an untouched offer has all twenty seats', () => {
  const o = launchOffer(row())!;
  assert.equal(o.percent, 20);
  assert.equal(o.seats, 20);
  assert.equal(o.left, 20);
  assert.equal(offerHeadline(o), 'First 20 customers — 20% off');
  assert.equal(offerLeftLine(o), '20 of 20 left');
});

test('seats count down as orders take them', () => {
  assert.equal(launchOffer(row({ usedCount: 3 }))!.left, 17);
  assert.equal(offerLeftLine(launchOffer(row({ usedCount: 19 }))!), 'Last one left');
});

test('the offer ends by itself', () => {
  assert.equal(launchOffer(row({ usedCount: 20 })), null, 'all twenty taken');
  assert.equal(launchOffer(row({ active: false })), null, 'switched off in Admin');
  assert.equal(launchOffer(row({ expiresAt: new Date('2020-01-01') })), null, 'past its date');
  assert.equal(launchOffer(null), null, 'no row at all');
});

test('a row that is not a percentage is not shown as one', () => {
  // a fixed-peso row cannot honestly wear "20% off", so it wears nothing
  assert.equal(launchOffer(row({ type: 'FIXED', value: 50_000 })), null);
});

test('the twenty per cent comes off the package, not the add-ons', () => {
  // "Yes 20% is in packages only."
  const extras = [{ code: 'SAVE_THE_DATE', name: 'Save the Date', priceCents: 50_000 }];
  const q = quote({ pkg: PKG, serviceMode: 'DFY', addOns: extras, coupon: row(), couponOn: 'package' });
  assert.equal(q.discountCents, 199_980, 'twenty per cent of the package alone');
  assert.equal(q.totalCents, 999_900 + 50_000 - 199_980, 'the add-on is paid in full');

  // and the card's number is that same package discount, so the two agree
  assert.equal(offerPrice(PKG.priceCents, 20), PKG.priceCents - q.discountCents);
});

test('a code the customer brought still comes off the whole order', () => {
  // only the opening offer is package-only; an ordinary coupon is unchanged
  const extras = [{ code: 'SAVE_THE_DATE', name: 'Save the Date', priceCents: 50_000 }];
  const q = quote({ pkg: PKG, serviceMode: 'DFY', addOns: extras, coupon: row({ code: 'FRIEND10', value: 10 }) });
  assert.equal(q.discountCents, Math.round((999_900 + 50_000) * 0.1));
});

test('the price on the card is the price in the quote', () => {
  const shown = offerPrice(PKG.priceCents, launchOffer(row())!.percent);
  assert.equal(shown, 799_920, '₱9,999 less twenty per cent');

  const charged = quote({ pkg: PKG, serviceMode: 'DFY', addOns: [], coupon: row(), couponOn: 'package' });
  assert.equal(charged.totalCents, shown, 'the checkout reaches the same number');
  assert.equal(charged.discountCents, 199_980);
});

test('a used-up offer leaves the price alone rather than refusing the sale', () => {
  const spent = row({ usedCount: 20 });
  assert.equal(launchOffer(spent), null);
  // buildQuote checks the row before handing it to quote() precisely so this
  // never becomes a couponError, which is what createOrder refuses to sell on
  const orders = readFileSync('src/lib/orders.ts', 'utf8');
  assert.match(orders, /if \(launch && !couponProblem\(launch, q\.totalCents\)\) \{/,
    'the offer is checked before it is applied');
  assert.match(orders, /if \(!typed\) \{/, 'and only when the customer typed no code of their own');
});

test('a code the customer typed is not replaced by ours', () => {
  const theirs: CouponLike = { ...row({ code: 'FRIEND50', value: 50 }) };
  const q = quote({ pkg: PKG, serviceMode: 'DFY', addOns: [], coupon: theirs });
  assert.equal(q.discountCents, 499_950, 'their fifty per cent stands');
});
