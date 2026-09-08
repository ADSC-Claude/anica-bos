import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, couponProblem, serviceFee, serviceModeAvailable, addOnAvailable, addOnPrice, type CouponLike, type PackageLike } from '../src/lib/pricing';
import { discountAmount, formatPeso, formatPesoShort, toCents } from '../src/lib/money';

const pkg: PackageLike = { code: 'WEDDING_STANDARD', name: 'Wedding Standard', tier: 'STANDARD', priceCents: 300000, dfyFeeCents: 120000, conciergeFeeCents: 0 };
const signature: PackageLike = { code: 'WEDDING_COMPLETE', name: 'Wedding Signature', tier: 'COMPLETE', priceCents: 400000, dfyFeeCents: 200000, conciergeFeeCents: 200000 };
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
  assert.equal(q.totalCents, 300000);
  assert.equal(q.serviceFeeCents, 0);
  assert.deepEqual(q.items.map((i) => i.kind), ['PACKAGE']);
});

test('service modes stack their fee on top of the package', () => {
  assert.equal(serviceFee(pkg, 'DFY'), 120000);
  // 3,000 package + 1,200 Done-For-You + 1,500 rush on Standard.
  const q = quote({ pkg, serviceMode: 'DFY', addOns: [{ code: 'RUSH', name: 'Rush', priceCents: 100000 }] });
  assert.equal(q.addOnsCents, 150000, 'rush is priced for the tier, not from the row');
  assert.equal(q.totalCents, 300000 + 120000 + 150000);
  assert.equal(q.totalCents, 570000);
  assert.equal(q.items.length, 3);
});

test('a percent coupon discounts the whole order, add-ons and fee included', () => {
  const q = quote({ pkg, serviceMode: 'DFY', addOns: [{ code: 'RUSH', name: 'Rush', priceCents: 100000 }], coupon: coupon() });
  const gross = 300000 + 120000 + 150000;
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
  assert.equal(q.totalCents, 300000);
  assert.ok(q.couponError);
});

test('a fixed coupon never takes the total below zero', () => {
  const q = quote({ pkg: { ...pkg, priceCents: 99900 }, serviceMode: 'DIY', addOns: [], coupon: coupon({ type: 'FIXED', value: 500000 }) });
  assert.equal(q.totalCents, 0);
  assert.equal(q.discountCents, 99900);
});

test('the Concierge mode is withdrawn, on every tier', () => {
  // Speed is bought on top of Done-For-You now, as the rush or priority add-on.
  // Selling it as a mode meant giving up Done-For-You to get it.
  for (const t of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    assert.equal(serviceModeAvailable('CONCIERGE', t), false, t);
    // Not merely unpriced: a zero fee reads as "Included" in the wizard, so the
    // quote must not carry a SERVICE line for a mode nobody can buy.
    const q = quote({ pkg: { ...signature, tier: t }, serviceMode: 'CONCIERGE', addOns: [] });
    assert.equal(q.serviceFeeCents, 0, t);
    assert.deepEqual(q.items.map((i) => i.kind), ['PACKAGE'], t);
    // The two that are sold stay sold.
    assert.equal(serviceModeAvailable('DIY', t), true, t);
    assert.equal(serviceModeAvailable('DFY', t), true, t);
  }
});

test('the queue jump is rush below Signature and priority on it', () => {
  const rush = { code: 'RUSH', name: 'Rush', priceCents: 100000 };
  const priority = { code: 'PRIORITY', name: 'Priority', priceCents: 200000 };
  // A tier is offered one or the other, never both: they are one purchase.
  assert.deepEqual(['BASIC', 'STANDARD', 'COMPLETE'].map((t) => addOnAvailable('RUSH', t as never)), [true, true, false]);
  assert.deepEqual(['BASIC', 'STANDARD', 'COMPLETE'].map((t) => addOnAvailable('PRIORITY', t as never)), [false, false, true]);

  // Signature, done for them, wanted early: 4,000 + 2,000 + 2,000.
  const sig = quote({ pkg: signature, serviceMode: 'DFY', addOns: [priority] });
  assert.equal(sig.totalCents, 800000);
  assert.equal(sig.items.map((i) => i.kind).join(','), 'PACKAGE,SERVICE,ADDON');

  // and the jump the tier is not sold is dropped rather than charged
  assert.equal(quote({ pkg: signature, serviceMode: 'DFY', addOns: [rush] }).addOnsCents, 0);
  assert.equal(quote({ pkg, serviceMode: 'DFY', addOns: [priority] }).addOnsCents, 0);
});

test('Rush is Basic and Standard only, and is dropped from a Signature quote', () => {
  const rush = { code: 'RUSH', name: 'Rush publish', priceCents: 100000 };
  assert.equal(addOnAvailable('RUSH', 'BASIC'), true);
  assert.equal(addOnAvailable('RUSH', 'STANDARD'), true);
  assert.equal(addOnAvailable('RUSH', 'COMPLETE'), false);
  assert.equal(addOnAvailable('PREMIUM_OPENING', 'COMPLETE'), true, 'other add-ons are unaffected');

  // 1,000 on Basic, 1,500 on Standard: jumping ahead of a bigger build costs more.
  assert.equal(addOnPrice(rush, 'BASIC'), 100000);
  assert.equal(addOnPrice(rush, 'STANDARD'), 150000);
  const other = { code: 'PRINTABLE', name: 'Printable', priceCents: 29900 };
  assert.equal(addOnPrice(other, 'BASIC'), 29900, 'every other add-on prices from its own row');

  assert.equal(quote({ pkg: { ...pkg, tier: 'BASIC' }, serviceMode: 'DIY', addOns: [rush] }).addOnsCents, 100000);
  assert.equal(quote({ pkg, serviceMode: 'DFY', addOns: [rush] }).addOnsCents, 150000);

  const dropped = quote({ pkg: signature, serviceMode: 'DIY', addOns: [rush] });
  assert.equal(dropped.addOnsCents, 0, 'not charged');
  assert.equal(dropped.totalCents, 400000);
  assert.ok(!dropped.items.some((i) => i.code === 'RUSH'), 'and not listed');
});
