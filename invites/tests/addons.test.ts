import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADDONS, RETIRED_ADDONS, campaigns } from '../src/lib/addon-catalogue';
import { ADDON_FEATURE, entitled, addOnForFeature, hasFeature, FEATURE_MIN_TIER, COMPARISON_ALL, TIERS } from '../src/lib/tiers';
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

test('the à la carte prices are the ones agreed', () => {
  const price = (code: string) => ADDONS.find((a) => a.code === code)?.price;
  assert.equal(price('QR_CHECKIN'), 1_000);
  assert.equal(price('SEATING_VIEWER'), 1_000);
  assert.equal(price('PASSWORD'), 300);
  assert.equal(price('SAVE_THE_DATE'), 500);
});

test('the catalogue has no duplicate codes, and nothing both sold and retired', () => {
  const codes = ADDONS.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length, 'a duplicate code would have one row overwrite the other');
  for (const code of RETIRED_ADDONS) {
    assert.equal(codes.includes(code), false, `${code} is retired and priced at the same time`);
  }
  // Every add-on that grants a feature is a row somebody can actually buy.
  for (const code of Object.keys(ADDON_FEATURE)) {
    const row = ADDONS.find((a) => a.code === code);
    assert.ok(row, `${code} unlocks a feature but is not in the catalogue`);
    assert.notEqual(row.held, true, `${code} unlocks a feature but is not for sale`);
  }
});
