/**
 * The privacy notice, checked against the settings it quotes.
 *
 * The whole reason this file exists is the bug that started this work: a consent
 * sentence that promised something the software did not do. A notice quoting a
 * retention period is the same trap one level down — the setting changes, the
 * prose does not, and a client is told "one year" while the job deletes at
 * three. So the periods are asserted to come from the settings rather than from
 * the author's memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrivacyNotice, NOTICE_EFFECTIVE } from '../src/lib/privacy-notice';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings-defaults';
import { PRIVACY_CONSENT } from '../src/lib/consent';

/**
 * DEFAULT_SETTINGS is `as const`, so `Settings` carries the literal type of each
 * default — `privacy.hostingLocations` is the type `'Singapore'`, not `string`,
 * and an override is rejected as not assignable. getSettings has the same
 * problem and solves it the same way (settings.ts merges into a loose record
 * and casts), which is fine here for the same reason: at runtime these values
 * come from a database and are plain strings.
 */
const settings = (over: Record<string, unknown> = {}): Settings =>
  ({ ...DEFAULT_SETTINGS, ...over }) as unknown as Settings;

const flatten = (s: Settings): string =>
  buildPrivacyNotice(s)
    .flatMap((section) => [section.heading, ...section.body, ...(section.bullets ?? [])])
    .join('\n');

test('the retention periods quoted are the ones configured', () => {
  const text = flatten(
    settings({ 'privacy.emailLogRetentionDays': 1095, 'privacy.loginLogRetentionDays': 90 }),
  );
  assert.match(text, /3 years/, 'email log period must follow the setting');
  assert.match(text, /90 days/, 'sign-in log period must follow the setting');
  assert.ok(!text.includes('2 years'), 'the old default must not be left behind in the prose');
});

test('whole years read as years and odd counts read as days', () => {
  const yearly = flatten(settings({ 'privacy.loginLogRetentionDays': 365 }));
  assert.match(yearly, /one year/);
  const odd = flatten(settings({ 'privacy.loginLogRetentionDays': 45 }));
  assert.match(odd, /45 days/);
});

test('a named contact is used, and the business is the fallback', () => {
  const named = flatten(
    settings({ 'privacy.dpoName': 'Anica Bos', 'privacy.dpoEmail': 'dpo@example.ph' }),
  );
  assert.match(named, /Anica Bos/);
  assert.match(named, /dpo@example\.ph/);

  const unnamed = flatten(settings({ 'privacy.dpoName': '', 'privacy.dpoEmail': '' }));
  assert.match(unnamed, /the owner of/, 'a guest must never read a blank where a name goes');
  assert.match(unnamed, new RegExp(DEFAULT_SETTINGS['business.email'].replace('.', '\\.')));
});

test('the hosting location is the one configured', () => {
  const text = flatten(settings({ 'privacy.hostingLocations': 'Singapore and Tokyo' }));
  assert.match(text, /hosted in Singapore and Tokyo/);
});

test('the notice covers what RA 10173 requires it to cover', () => {
  const headings = buildPrivacyNotice(settings()).map((s) => s.heading.toLowerCase());
  for (const required of [
    'who holds your information', // the controller, and how to reach them
    'what we collect, and why', // data and purpose
    'your health information', // sensitive personal information
    'who else sees it', // disclosure to third parties
    'where it is kept', // cross-border transfer
    'how long we keep it', // retention
    'your rights', // data subject rights
    'how we protect it', // security measures
  ]) {
    assert.ok(headings.includes(required), `the notice is missing "${required}"`);
  }
});

test('the rights section names the NPC and the erasure carve-out', () => {
  const text = flatten(settings());
  assert.match(text, /National Privacy Commission/);
  assert.match(text, /privacy\.gov\.ph/);
  assert.match(text, /ten years/, 'the BIR limit on erasure has to be stated, not buried');
});

test('the notice does not contradict the sentence beside the tick box', () => {
  const text = flatten(settings());

  // Both promise the same three things. If the consent is ever reworded to drop
  // one, this is where the notice stops agreeing with it.
  for (const [claim, inConsent, inNotice] of [
    ['encrypted backups', /encrypted backup/, /[Bb]ackups are encrypted/],
    ['access logging', /opens my health record it is logged/, /records who opened it and when/],
    ['erasure on request', /erased on request/, /have your information erased/],
  ] as const) {
    assert.match(PRIVACY_CONSENT, inConsent, `consent no longer claims ${claim}`);
    assert.match(text, inNotice, `the notice no longer explains ${claim}`);
  }

  // Neither may resurrect the promise this whole area exists to have removed.
  assert.ok(!/never .{0,20}exported/i.test(PRIVACY_CONSENT));
  assert.ok(!/never .{0,20}exported/i.test(text));
});

test('the effective date is a real date somebody bumped', () => {
  assert.match(NOTICE_EFFECTIVE, /^\d{1,2} [A-Z][a-z]+ \d{4}$/);
});
