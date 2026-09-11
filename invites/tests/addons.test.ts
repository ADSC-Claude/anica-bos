import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ADDONS, SEED_ONLY_ADDONS, RETIRED_ADDONS, SHELVED_ADDONS, campaigns } from '../src/lib/addon-catalogue';
import { ADDON_FEATURE, ADDON_EXTRA, entitled, addOnForFeature, hasFeature, FEATURE_MIN_TIER, COMPARISON_ALL, TIERS } from '../src/lib/tiers';
import { addOnAvailable } from '../src/lib/pricing';

test('a package that includes a feature is not sold it again', () => {
  // Read from the feature, not from a list of tiers: #127 moved check-in and
  // seating from Signature up to Luxury, and this stayed right through it.
  for (const [code, features] of Object.entries(ADDON_FEATURE)) {
    for (const tier of TIERS) {
      assert.equal(
        addOnAvailable(code, tier),
        !hasFeature(tier, features[0]),
        `${code} on ${tier}`,
      );
    }
  }

  // Which today means:
  assert.equal(addOnAvailable('QR_CHECKIN', 'LUXURY'), false, 'Luxury includes check-in');
  assert.equal(addOnAvailable('QR_CHECKIN', 'COMPLETE'), true, 'Signature does not');
  assert.equal(addOnAvailable('SEATING_VIEWER', 'LUXURY'), false);
  assert.equal(addOnAvailable('PASSWORD', 'COMPLETE'), false, 'Signature includes the password');
  assert.equal(addOnAvailable('PASSWORD', 'BASIC'), true);
});

test('an add-on unlocks its feature on a package that lacks it', () => {
  assert.equal(entitled({ tier: 'BASIC', addOns: [] }, 'checkin'), false);
  assert.equal(entitled({ tier: 'BASIC', addOns: ['QR_CHECKIN'] }, 'checkin'), true);
  assert.equal(entitled({ tier: 'BASIC', addOns: ['PASSWORD'] }, 'privacy.password'), true);

  // and only its own feature
  assert.equal(entitled({ tier: 'BASIC', addOns: ['PASSWORD'] }, 'checkin'), false);
  assert.equal(entitled({ tier: 'BASIC', addOns: ['QR_CHECKIN'] }, 'seating'), false);

  // the package still grants what it always did
  assert.equal(entitled({ tier: 'LUXURY', addOns: [] }, 'checkin'), true);
  assert.equal(entitled({ tier: 'BASIC', addOns: [] }, 'guestbook'), false);
});

test('check-in and seating carry the guest list they cannot work without', () => {
  // Both look a guest up by their token. Sold without the list, a couple would
  // pay ₱1,000 for a page they can never put anybody on.
  for (const code of ['QR_CHECKIN', 'SEATING_VIEWER']) {
    const inv = { tier: 'BASIC' as const, addOns: [code] };
    assert.equal(entitled(inv, 'guests.manager'), true, `${code} needs the guest list`);
    assert.equal(entitled(inv, 'rsvp.personalLinks'), true, `${code} needs per-guest links`);
  }
  // The password has no such dependency and grants nothing else.
  assert.deepEqual([...ADDON_FEATURE.PASSWORD], ['privacy.password']);
});

test('a guest communication suite buys the RSVP confirmation; a text pack does not', () => {
  // Luxury writes back to every guest who accepts, free. Below it the same send
  // is the paid e-mail blast, and the way to have it there is to buy one — a
  // comms suite, which is the product that e-mails guests for a couple.
  assert.equal(entitled({ tier: 'COMPLETE', addOns: [] }, 'rsvp.emailConfirmation'), false);
  assert.equal(entitled({ tier: 'COMPLETE', addOns: ['COMMS_BASIC_100'] }, 'rsvp.emailConfirmation'), true);
  assert.equal(entitled({ tier: 'BASIC', addOns: ['COMMS_EXCLUSIVE_1000'] }, 'rsvp.emailConfirmation'), true);

  // Texts only, so no. Selling an e-mail with a text pack is the same mistake
  // as refusing one with a comms suite, in the other direction.
  assert.equal(entitled({ tier: 'BASIC', addOns: ['SMS_REMINDER_1000'] }, 'rsvp.emailConfirmation'), false);

  // And it carries the confirmation, not the rest of the top package.
  assert.equal(entitled({ tier: 'BASIC', addOns: ['COMMS_EXCLUSIVE_1000'] }, 'checkin'), false);
  assert.equal(entitled({ tier: 'BASIC', addOns: ['COMMS_EXCLUSIVE_1000'] }, 'photoSharing'), false);

  // Every catalogued suite, not only the two written out above: the codes are
  // matched by pattern, and a new band must not fall outside it.
  for (const row of campaigns()) {
    const bought = { tier: 'BASIC' as const, addOns: [row.code] };
    assert.equal(
      entitled(bought, 'rsvp.emailConfirmation'),
      row.code.startsWith('COMMS_'),
      `${row.code} and the confirmation`,
    );
  }
});

test('an add-on that carries a feature along is still sold to a package that has it', () => {
  // This is why ADDON_EXTRA is not another line in ADDON_FEATURE. The first
  // entry there decides who is offered an add-on at all — a package that
  // includes the headline is not sold it twice — and Luxury already has the
  // confirmation. Reaching that rule would refuse Luxury a comms suite, which
  // is the package most likely to buy one.
  for (const row of campaigns()) {
    for (const tier of TIERS) {
      assert.equal(addOnAvailable(row.code, tier), true, `${row.code} refused to ${tier}`);
    }
  }
});

test('what an add-on carries along is a real feature some package includes', () => {
  // The same rule as the headline features below: a second door to a room that
  // exists, never a promise of one.
  for (const { match, features } of ADDON_EXTRA) {
    assert.ok(features.length > 0, `${match} carries nothing`);
    for (const f of features) {
      assert.ok(FEATURE_MIN_TIER[f], `${match} carries ${f}, which is not a feature`);
      assert.equal(hasFeature('LUXURY', f), true, `${match} carries ${f}, which no package includes`);
      // Not a headline anywhere, or addOnAvailable would read it after all.
      assert.equal(addOnForFeature(f), undefined, `${f} is both carried along and a headline`);
    }
    // The pattern has to match something in the catalogue, or it is a rule
    // about codes that do not exist.
    assert.ok(ADDONS.some((a) => match.test(a.code)), `${match} matches no add-on`);
  }
});

test('the confirmation row offers an add-on only once that add-on is for sale', () => {
  // Every comms suite is held — priced, catalogued, not sellable, because the
  // guest count at checkout that holds a band to its number does not exist. So
  // the row below Luxury is an honest blank today rather than "Add-on".
  //
  // #129 took the rows out of this table that offered what nobody could buy.
  // This keeps one from walking back in, and fails on the day the suites go on
  // sale, so the row is changed with them instead of a year later.
  const row = COMPARISON_ALL.find((r) => r.label.startsWith('E-mail confirmation'));
  assert.ok(row, 'the comparison row is gone');

  const sellable = ADDONS.some(
    (a) => !a.held && ADDON_EXTRA.some((e) => e.match.test(a.code) && e.features.includes('rsvp.emailConfirmation')),
  );
  assert.equal(sellable, false, 'a comms suite is for sale now — the row below Luxury should say "Add-on"');

  for (const tier of TIERS) {
    const includes = hasFeature(tier, 'rsvp.emailConfirmation');
    assert.equal(row.cells[tier], includes ? true : sellable ? 'Add-on' : false, `${row.label} on ${tier}`);
  }
});

test('every add-on feature is already built and sold on some tier', () => {
  // An add-on is a second door to a room that exists, never a promise of one.
  for (const [code, features] of Object.entries(ADDON_FEATURE)) {
    assert.ok(features.length > 0, `${code} grants nothing`);
    for (const f of features) {
      assert.ok(FEATURE_MIN_TIER[f], `${code} grants ${f}, which is not a feature`);
      assert.equal(hasFeature('LUXURY', f), true, `${code} grants ${f}, which no package includes`);
    }
    // and the headline is what names it
    assert.equal(addOnForFeature(features[0]), code);
  }
});

test('the comparison table matches what each package is actually offered', () => {
  // The row a customer reads and the rule the checkout enforces are the same
  // fact, so the table is checked against ADDON_FEATURE rather than retyped.
  const ROW: Record<string, string> = {
    QR_CHECKIN: 'QR check-in on event day',
    SEATING_VIEWER: "Seating chart on the guest's page",
    PASSWORD: 'Password on the link',
    PHOTO_SHARING: 'Post-event photo sharing (guest uploads)',
  };
  assert.deepEqual(Object.keys(ROW).sort(), Object.keys(ADDON_FEATURE).sort(), 'a sellable feature with no row');

  for (const [code, label] of Object.entries(ROW)) {
    const row = COMPARISON_ALL.find((r) => r.label === label);
    assert.ok(row, `no comparison row labelled ${label}`);
    for (const tier of TIERS) {
      const includes = hasFeature(tier, ADDON_FEATURE[code][0]);
      assert.equal(row.cells[tier], includes ? true : 'Add-on', `${label} on ${tier}`);
    }
  }
});

test('the reminder campaigns are priced as agreed, and none is for sale', () => {
  const rows = campaigns();
  const price = (code: string) => {
    const row = rows.find((r) => r.code === code);
    assert.ok(row, `${code} is missing from the catalogue`);
    return row.price;
  };

  // Texts only: one message, by guest band.
  assert.equal(price('SMS_REMINDER_100'), 599);
  assert.equal(price('SMS_REMINDER_250'), 999);
  assert.equal(price('SMS_REMINDER_500'), 1_499);
  assert.equal(price('SMS_REMINDER_1000'), 2_499);

  // Text and e-mail, by how many of the four messages are sent.
  assert.deepEqual([100, 250, 500, 1000].map((b) => price(`COMMS_BASIC_${b}`)), [799, 1_299, 1_999, 3_299]);
  assert.deepEqual([100, 250, 500, 1000].map((b) => price(`COMMS_STANDARD_${b}`)), [1_399, 2_299, 3_499, 5_499]);
  assert.deepEqual([100, 250, 500, 1000].map((b) => price(`COMMS_DELUXE_${b}`)), [1_999, 3_299, 4_999, 7_999]);
  assert.deepEqual([100, 250, 500, 1000].map((b) => price(`COMMS_EXCLUSIVE_${b}`)), [2_499, 4_299, 6_999, 10_999]);

  assert.equal(rows.length, 20, 'four bands across five campaigns');

  // Nothing schedules a message yet, so nothing may be bought from the site.
  for (const r of rows) assert.equal(r.held, true, `${r.code} is for sale and cannot be delivered`);

  // A band always costs more than the same band one step down.
  for (const family of ['SMS_REMINDER', 'COMMS_BASIC', 'COMMS_STANDARD', 'COMMS_DELUXE', 'COMMS_EXCLUSIVE']) {
    const bands = [100, 250, 500, 1000].map((b) => price(`${family}_${b}`));
    for (let i = 1; i < bands.length; i++) {
      assert.ok(bands[i] > bands[i - 1], `${family} does not rise from ${bands[i - 1]} to ${bands[i]}`);
    }
  }
});

test('the printable is sold as a thing we send, never as a button', () => {
  // It was shelved because the Print / PDF route puts the live page on A4 —
  // seventeen sheets on a real wedding. What changed to bring it back is the
  // promise, not the layout: arranging pages by hand is work this business
  // already does. So the wording must not describe a file the customer makes.
  const row = ADDONS.find((a) => a.code === 'PRINTABLE');
  assert.ok(row, 'the printable is not for sale');
  assert.equal(row.price, 199);
  assert.notEqual(row.held, true, 'the printable is priced but not sellable');
  assert.equal(SHELVED_ADDONS.some((x) => x.code === 'PRINTABLE'), false, 'it is on sale and hidden at the same time');

  for (const promise of [/download/i, /instant/i, /button/i, /straight away/i, /yourself/i]) {
    assert.doesNotMatch(row.description, promise, `the printable promises "${promise}"`);
  }
  // And it says when, because "we send it to you" with no when is the sentence
  // that generates the first support message.
  assert.match(row.description, /within a working day/);
});

test('the à la carte prices are the ones agreed', () => {
  const price = (code: string) => ADDONS.find((a) => a.code === code)?.price;
  assert.equal(price('PRINTABLE'), 199);
  assert.equal(price('QR_CHECKIN'), 1_000);
  assert.equal(price('SEATING_VIEWER'), 1_000);
  assert.equal(price('PASSWORD'), 300);
  assert.equal(price('SAVE_THE_DATE'), 500);
});

test('a withdrawn add-on says why it went, in its own words', () => {
  // The reason reaches an operator's log and the audit entry, which is the only
  // lasting record of why a row customers could buy last week is gone this
  // week. One sentence used to be hardcoded for all of them, so withdrawing the
  // SMS pack announced that "the design is settled at publish".
  const reasons = new Set<string>();
  for (const { code, reason } of RETIRED_ADDONS) {
    assert.ok(reason.trim(), `${code} is withdrawn without saying why`);
    assert.equal(reason, reason.trim().replace(/\.$/, ''), `${code}: the reason is printed inside brackets, so no trailing stop`);
    reasons.add(reason);
  }
  assert.equal(reasons.size, RETIRED_ADDONS.length, 'two add-ons share a reason — one of them is probably wrong');
});

test('a shelved add-on is off the website, priced, and not confused with a retired one', () => {
  // Off the website and still in the system: active goes false, the row, its
  // price and any order that bought one are untouched. The two lists are apart
  // because the decisions are: retired is "we stopped selling this", shelved is
  // "we should not have been selling it yet".
  const retired = new Set(RETIRED_ADDONS.map((r) => r.code));
  const priced = new Set(ADDONS.map((a) => a.code));
  const seen = new Set<string>();

  for (const { code, reason } of SHELVED_ADDONS) {
    assert.ok(reason.trim(), `${code} is hidden without saying why`);
    assert.equal(retired.has(code), false, `${code} is both retired and shelved`);
    assert.equal(seen.has(code), false, `${code} is shelved twice`);
    seen.add(code);
    // Not in ADDONS, so a pricing run never overrules the admin on what it costs.
    assert.equal(priced.has(code), false, `${code} is shelved and would also be repriced`);
  }

  assert.deepEqual(SHELVED_ADDONS.map((s) => s.code).sort(), ['CUSTOM_DOMAIN']);
});

test('the catalogue has no duplicate codes, and nothing both sold and retired', () => {
  const codes = ADDONS.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length, 'a duplicate code would have one row overwrite the other');
  for (const { code } of RETIRED_ADDONS) {
    assert.equal(codes.includes(code), false, `${code} is retired and priced at the same time`);
  }
  // Every add-on that grants a feature is a row somebody can actually buy.
  for (const code of Object.keys(ADDON_FEATURE)) {
    const row = ADDONS.find((a) => a.code === code);
    assert.ok(row, `${code} unlocks a feature but is not in the catalogue`);
    assert.notEqual(row.held, true, `${code} unlocks a feature but is not for sale`);
  }
});

test('the seed writes each add-on code exactly once', () => {
  // prisma/seed.ts puts every add-on in a single createMany, so a code in both
  // lists violates AddOn_code_key and takes the whole seed down — which is a
  // database error no typecheck can see. It happened for real: the printable
  // was in the seed at ₱299 and in ADDONS at ₱199 on the same commit, and CI
  // went red on the insert.
  const codes = [...SEED_ONLY_ADDONS.map((a) => a.code), ...ADDONS.map((a) => a.code)];
  const seen = new Set<string>();
  const twice = codes.filter((c) => (seen.has(c) ? true : (seen.add(c), false)));
  assert.deepEqual(twice, [], `both lists create ${twice.join(', ')} — the seed will fail on AddOn_code_key`);
});

test('the seed writes no add-on code of its own', () => {
  // The two tests above only hold if every row in that createMany comes from
  // one of the two lists. An inline row put back into prisma/seed.ts would be
  // invisible to them and would fail the seed again, in CI, on a database
  // error — so the createMany is read here and required to be two spreads.
  const seed = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
  const i = seed.indexOf('prisma.addOn.createMany');
  assert.notEqual(i, -1, 'the seed no longer creates add-ons the way this test expects');
  const call = seed.slice(i, seed.indexOf('});', i));
  // A literal code, not `code: a.code` — that one is the spread mapping its own
  // field across and is the whole point of the spread.
  assert.doesNotMatch(call, /code:\s*['"`]/, 'the seed writes an add-on code inline again — put it in a catalogue list');
  assert.match(call, /\.\.\.SEED_ONLY_ADDONS/);
  assert.match(call, /\.\.\.ADDONS\.map/);
});

test('a row the catalogue prices is not also one the seed alone owns', () => {
  // The two lists mean different things: ADDONS is repriced by every pricing
  // run, SEED_ONLY_ADDONS keeps whatever the admin last typed. A code in both
  // would have a price that changes depending on which ran last.
  const seedOnly = new Set(SEED_ONLY_ADDONS.map((a) => a.code));
  for (const a of ADDONS) {
    assert.equal(seedOnly.has(a.code), false, `${a.code} is priced by the catalogue and owned by the seed`);
  }
  // Today: the premium opening, the domain, and the two withdrawn rows.
  assert.deepEqual([...seedOnly].sort(), ['CUSTOM_DOMAIN', 'PREMIUM_OPENING', 'SMS_PACK', 'TEMPLATE_SWITCH']);
});

test('every picture an add-on promises is a file that exists', () => {
  // A typo'd path is not a missing picture, it is a broken frame on the
  // landing page and in the checkout, next to the price. The markup renders
  // nothing when the column is blank, so the only way to get a broken image is
  // to name a file that is not there — which is what this catches.
  for (const a of ADDONS) {
    if (a.image === undefined) continue;
    assert.ok(a.image.startsWith('/'), `${a.code}: ${a.image} is not a path from the site root`);
    assert.ok(a.image.trim(), `${a.code} declares an empty picture — leave the field out instead`);
    const file = new URL(`../public${a.image}`, import.meta.url);
    assert.ok(existsSync(file), `${a.code} points at ${a.image}, which is not in public/`);
  }
});

test('everything for sale says what it is, in a sentence a customer can read', () => {
  // The description is the whole of what a customer is told before they tick
  // the box. A code and a price with no sentence is a thing nobody buys.
  for (const a of ADDONS) {
    assert.ok(a.description.trim().length > 40, `${a.code} has no real description`);
    assert.ok(/[.!]$/.test(a.description.trim()), `${a.code}: the description is a sentence, so it ends like one`);
    assert.equal(a.name, a.name.trim());
    assert.ok(a.name.trim(), `${a.code} has no name`);
  }
});

test('the queue jumps quote the turnaround they are shortening', () => {
  // Both descriptions name the ordinary wait to say what they are saving you,
  // so both have to move when it does. It is seven to ten working days now.
  for (const code of ['RUSH', 'PRIORITY']) {
    const row = ADDONS.find((a) => a.code === code);
    assert.ok(row);
    assert.match(row.description, /seven to ten/, `${code} quotes a turnaround we no longer promise`);
  }
});
