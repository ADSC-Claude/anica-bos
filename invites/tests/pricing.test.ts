import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, couponProblem, serviceFee, serviceModeAvailable, DEFAULT_SERVICE_MODE, addOnAvailable, addOnPrice, addOnPriceRises, addOnIncluded, revisionRounds, type CouponLike, type PackageLike } from '../src/lib/pricing';
import { TIERS } from '../src/lib/tiers';
import { SERVICE_MODES } from '../src/lib/pricing';
import { turnaroundLabel } from '../src/lib/datetime';
import { PROCESSING_DAYS } from '../src/lib/progress';
import { DEFAULT_SETTINGS } from '../src/lib/settings-defaults';
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

test('a quote with no service fee is the package alone', () => {
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

test('one service is sold; the other two modes are withdrawn on every tier', () => {
  for (const t of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    // We build every invitation. Concierge went when speed became the rush or
    // priority add-on; DIY went because the builder and the intake form are
    // generated from one definition, so it sold the customer their own work.
    assert.equal(serviceModeAvailable('DFY', t), true, t);
    assert.equal(serviceModeAvailable('CONCIERGE', t), false, t);
    assert.equal(serviceModeAvailable('DIY', t), false, t);
    // Not merely unpriced: a zero fee reads as "Included" in the wizard, so a
    // quote must not carry a SERVICE line for a mode nobody can buy.
    for (const withdrawn of ['CONCIERGE', 'DIY'] as const) {
      const q = quote({ pkg: { ...signature, tier: t }, serviceMode: withdrawn, addOns: [] });
      assert.equal(q.serviceFeeCents, 0, `${t} ${withdrawn}`);
      assert.deepEqual(q.items.map((i) => i.kind), ['PACKAGE'], `${t} ${withdrawn}`);
    }
  }
  assert.equal(DEFAULT_SERVICE_MODE, 'DFY', 'and it is what a new order is stamped with');
});

test('the queue jumps are split by what we can promise on the work', () => {
  const rush = { code: 'RUSH', name: 'Rush', priceCents: 100000 };
  const priority = { code: 'PRIORITY', name: 'Priority', priceCents: 200000 };
  // Not the same offer twice: rush is a day, which the small builds can have,
  // and priority is two to three, which is what the big ones can.
  assert.deepEqual(TIERS.map((t) => addOnAvailable('RUSH', t)), [true, true, false, false]);
  assert.deepEqual(TIERS.map((t) => addOnAvailable('PRIORITY', t)), [false, false, true, true]);

  // Every other add-on is still offered to every package.
  for (const code of ['PREMIUM_OPENING', 'PRINTABLE', 'CUSTOM_DOMAIN', 'SMS_PACK']) {
    assert.deepEqual(TIERS.map((t) => addOnAvailable(code, t)), [true, true, true, true], code);
  }

  // Signature, done for them, wanted early: 4,000 + 2,000 + 2,000.
  const sig = quote({ pkg: signature, serviceMode: 'DFY', addOns: [priority] });
  assert.equal(sig.totalCents, 800000);
  assert.equal(sig.items.map((i) => i.kind).join(','), 'PACKAGE,SERVICE,ADDON');

  // And the jump a package is not sold is dropped rather than charged.
  assert.equal(quote({ pkg: signature, serviceMode: 'DFY', addOns: [rush] }).addOnsCents, 0);
  assert.equal(quote({ pkg, serviceMode: 'DFY', addOns: [priority] }).addOnsCents, 0);
});

// The checkout card used to print the catalogue row while the order charged
// the tier price — 1,000 on the label, 1,500 on the bill. Both now go through
// addOnPrice, and this names the one add-on whose price moves, so a second one
// cannot be added without the pages being told.
test('only rush gets dearer with the package; only Save the Date gets cheaper', () => {
  assert.equal(addOnPriceRises('RUSH'), true);
  for (const code of ['PRIORITY', 'SAVE_THE_DATE', 'PREMIUM_OPENING', 'PRINTABLE', 'CUSTOM_DOMAIN', 'SMS_PACK']) {
    assert.equal(addOnPriceRises(code), false, code);
  }

  // Everything else is flat across the packages.
  for (const code of ['PRIORITY', 'PREMIUM_OPENING', 'PRINTABLE', 'CUSTOM_DOMAIN', 'SMS_PACK']) {
    const row = { code, name: code, priceCents: 29900 };
    assert.deepEqual(TIERS.map((t) => addOnPrice(row, t)), [29900, 29900, 29900, 29900], code);
  }

  // Save the Date is the one that falls rather than rises: Luxury is given it.
  const std = { code: 'SAVE_THE_DATE', name: 'Save the Date card', priceCents: 29900 };
  assert.deepEqual(TIERS.map((t) => addOnPrice(std, t)), [29900, 29900, 29900, 0]);
});

test('rush costs more the bigger the build it jumps ahead of', () => {
  const rush = { code: 'RUSH', name: 'Rush publish', priceCents: 100000 };
  assert.equal(addOnPrice(rush, 'BASIC'), 100000);
  assert.equal(addOnPrice(rush, 'STANDARD'), 150000);
  const other = { code: 'PRINTABLE', name: 'Printable', priceCents: 29900 };
  assert.equal(addOnPrice(other, 'BASIC'), 29900, 'every other add-on prices from its own row');

  // Never less for a bigger package than a smaller one, among the packages it
  // is sold to. Above those it is not sold at all, so the catalogue fallback
  // there is never charged.
  let last = 0;
  for (const tier of TIERS.filter((t) => addOnAvailable('RUSH', t))) {
    const price = addOnPrice(rush, tier);
    assert.ok(price >= last, `rush on ${tier} costs less than the package below it`);
    last = price;
  }

  assert.equal(quote({ pkg: { ...pkg, tier: 'BASIC' }, serviceMode: 'DIY', addOns: [rush] }).addOnsCents, 100000);
  assert.equal(quote({ pkg, serviceMode: 'DFY', addOns: [rush] }).addOnsCents, 150000);
});

test('a build paid to be quick carries fewer rounds, never more', () => {
  const ordinary = 2;
  // What the tiers are sold when they buy the jump.
  assert.equal(revisionRounds('BASIC', true, ordinary), 1, 'no room for two passes inside 24 hours');
  assert.equal(revisionRounds('STANDARD', true, ordinary), 2);
  assert.equal(revisionRounds('COMPLETE', true, ordinary), 2);

  // Nothing changes for a build that was not rushed.
  for (const t of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    assert.equal(revisionRounds(t, false, ordinary), ordinary, t);
  }

  // It caps, it does not grant: a generous ordinary allowance is cut down to
  // the rushed number, and a meagre one is left alone rather than topped up.
  assert.equal(revisionRounds('COMPLETE', true, 6), 2, 'cut down');
  assert.equal(revisionRounds('BASIC', true, 0), 0, 'never topped up');
});

// The second card is Luxury's, given rather than sold. It stays an add-on row
// so the order says what it carried and activation has the same thing to look
// for whoever bought it — it simply costs nothing.
test('Save the Date is included with Luxury and sold to everybody else', () => {
  const std = { code: 'SAVE_THE_DATE', name: 'Save the Date card', priceCents: 29900 };
  assert.equal(addOnPrice(std, 'BASIC'), 29900);
  assert.equal(addOnPrice(std, 'COMPLETE'), 29900);
  assert.equal(addOnPrice(std, 'LUXURY'), 0);
  assert.equal(addOnIncluded('SAVE_THE_DATE', 'LUXURY'), true);
  assert.equal(addOnIncluded('SAVE_THE_DATE', 'COMPLETE'), false);
  assert.equal(addOnIncluded('RUSH', 'LUXURY'), false, 'only the card is given away');

  const luxury: PackageLike = { code: 'WEDDING_LUXURY', name: 'Wedding Luxury', tier: 'LUXURY', priceCents: 750000, dfyFeeCents: 0, conciergeFeeCents: 0 };
  const q = quote({ pkg: luxury, serviceMode: 'DFY', addOns: [std], occasion: 'WEDDING' });
  assert.equal(q.totalCents, 750000, 'the card adds nothing to the bill');
  assert.ok(q.items.some((i) => i.code === 'SAVE_THE_DATE' && i.amountCents === 0), 'and is still named on the order');
});

// The turnaround is written in two places that must not drift: SERVICE_MODES
// prints it on the landing page and in the checkout, and the settings are what
// a due date is actually counted from. PROCESSING_DAYS is the third — the date
// a customer plans against — and it has to be the far end, because a date that
// arrives early is a good surprise and one that arrives late is a broken
// promise.
test('what we print as the turnaround is what we count a due date from', () => {
  const dfy = SERVICE_MODES.find((m) => m.key === 'DFY')!;
  assert.equal(dfy.turnaround, turnaroundLabel(DEFAULT_SETTINGS['dfy.turnaroundDays'], DEFAULT_SETTINGS['dfy.turnaroundDaysMax']));
  assert.equal(dfy.turnaround, '7 to 10 working days');
  assert.equal(PROCESSING_DAYS, DEFAULT_SETTINGS['dfy.turnaroundDaysMax'], 'the date a customer plans against is the far end');

  // Priority is two to three, and never quicker than rush is allowed to be.
  assert.equal(turnaroundLabel(DEFAULT_SETTINGS['concierge.turnaroundDays'], DEFAULT_SETTINGS['concierge.turnaroundDaysMax']), '2 to 3 working days');
  assert.ok(DEFAULT_SETTINGS['concierge.turnaroundDaysMax'] < DEFAULT_SETTINGS['dfy.turnaroundDays'], 'a queue jump has to beat the ordinary promise');

  // A single number still reads as one.
  assert.equal(turnaroundLabel(3, 3), '3 working days');
  assert.equal(turnaroundLabel(1, 1), '1 working day');
});
