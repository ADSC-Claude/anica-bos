import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, couponProblem, serviceFee, type CouponLike, type PackageLike } from '../src/lib/pricing';
import { discountAmount, formatPeso, formatPesoShort, toCents } from '../src/lib/money';

const pkg: PackageLike = { code: 'WEDDING_STANDARD', name: 'Wedding Standard', priceCents: 199900, dfyFeeCents: 80000, conciergeFeeCents: 250000 };
const coupon = (over: Partial<CouponLike> = {}): CouponLike => ({ code: 'LAUNCH20', type: 'PERCENT', value: 20, minSpendCents: 0, expiresAt: null, usageLimit: null, usedCount: 0, active: true, ...over });

test('money is integer centavos and formats the Filipino way', () => {
  assert.equal(toCents('1,999.50'), 199950);
  assert.equal(formatPeso(199900), '₱1,999.00');
  assert.equal(formatPesoShort(199900), '₱1,999');
  assert.equal(formatPesoShort(199950), '₱1,999.50');
  assert.equal(discountAmount(99900, 'FIXED', 200000), 99900, 'never more than the base');
  assert.equal(discountAmount(199900, 'PERCENT', 20), 39980);
});

test('a DIY quote is the package alone', () => {
  const q = quote({ pkg, serviceMode: 'DIY', addOns: [] });
  assert.equal(q.totalCents, 199900);
  assert.equal(q.serviceFeeCents, 0);
  assert.deepEqual(q.items.map((i) => i.kind), ['PACKAGE']);
});

test('service modes stack their fee on top of the package', () => {
  assert.equal(serviceFee(pkg, 'DFY'), 80000);
  assert.equal(serviceFee(pkg, 'CONCIERGE'), 250000);
  const q = quote({ pkg, serviceMode: 'DFY', addOns: [{ code: 'RUSH', name: 'Rush', priceCents: 49900 }] });
  assert.equal(q.totalCents, 199900 + 80000 + 49900);
  assert.equal(q.addOnsCents, 49900);
  assert.equal(q.items.length, 3);
});

test('a percent coupon discounts the whole order, add-ons and fee included', () => {
  const q = quote({ pkg, serviceMode: 'DFY', addOns: [{ code: 'RUSH', name: 'Rush', priceCents: 49900 }], coupon: coupon() });
  const gross = 199900 + 80000 + 49900;
  assert.equal(q.discountCents, Math.round(gross * 0.2));
  assert.equal(q.totalCents, gross - Math.round(gross * 0.2));
  assert.equal(q.items.at(-1)?.kind, 'DISCOUNT');
  assert.equal(q.couponError, undefined);
});

test('a bad coupon is reported, not applied', () => {
  assert.equal(couponProblem(null, 100000), 'That code does not exist.');
  assert.equal(couponProblem(coupon({ active: false }), 100000), 'That code is no longer active.');
  assert.equal(couponProblem(coupon({ expiresAt: new Date(Date.now() - 1000) }), 100000), 'That code has expired.');
  assert.equal(couponProblem(coupon({ usageLimit: 5, usedCount: 5 }), 100000), 'That code has been fully used.');
  assert.equal(couponProblem(coupon({ minSpendCents: 500000 }), 100000), 'Your order is below the minimum for that code.');
  const q = quote({ pkg, serviceMode: 'DIY', addOns: [], coupon: coupon({ active: false }) });
  assert.equal(q.discountCents, 0);
  assert.equal(q.totalCents, 199900);
  assert.ok(q.couponError);
});

test('a fixed coupon never takes the total below zero', () => {
  const q = quote({ pkg: { ...pkg, priceCents: 99900 }, serviceMode: 'DIY', addOns: [], coupon: coupon({ type: 'FIXED', value: 500000 }) });
  assert.equal(q.totalCents, 0);
  assert.equal(q.discountCents, 99900);
});
