import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRefundPolicy, REFUND_DAYS } from '../src/lib/refund-policy';
import { DEFAULT_SETTINGS, type Settings } from '../src/lib/settings-defaults';

/**
 * DEFAULT_SETTINGS is `as const`, so `Settings` carries the literal type of
 * each default and a plain spread of an override is rejected as not
 * assignable. Same shape as the helper in privacy-notice.test.ts, and for the
 * same reason.
 */
const settings = (over: Record<string, unknown> = {}): Settings =>
  ({ ...DEFAULT_SETTINGS, ...over }) as unknown as Settings;

const base = settings();

function flatten(s: Settings): string {
  return buildRefundPolicy(s)
    .flatMap((section) => [section.heading, ...section.body, ...(section.bullets ?? [])])
    .join('\n');
}

test('the reservation percentage quoted is the one that is charged', () => {
  const text = flatten(settings({ 'booking.depositPercent': 30 }));
  assert.match(text, /reservation fee of 30%/);
  // And the balance is the complement, not a second hardcoded number.
  assert.match(text, /remaining 70%/);

  const half = flatten(settings({ 'booking.depositPercent': 50 }));
  assert.match(half, /reservation fee of 50%/);
  assert.match(half, /remaining 50%/);
});

test('the cancellation window quoted is the one that is enforced', () => {
  const text = flatten(settings({ 'booking.cancellationHours': 5 }));
  assert.match(text, /at least 5 hours/);
  assert.doesNotMatch(text, /at least 5 hour\b/);

  // One hour is singular. A policy that says "1 hours" reads as unproofed, and
  // a guest who spots that trusts the rest of it less.
  const one = flatten(settings({ 'booking.cancellationHours': 1 }));
  assert.match(one, /at least 1 hour\b/);
  assert.doesNotMatch(one, /1 hours/);
});

test('a forfeit house policy never promises a refund of the fee', () => {
  const text = flatten(settings({ 'booking.depositOnCancel': 'FORFEIT' }));
  assert.match(text, /not refundable once a booking is confirmed/);
  // The one refund that survives a forfeit policy is the spa's own fault.
  assert.match(text, /Cancelled by .+ for any reason — reservation fee refunded in full/);
  assert.doesNotMatch(text, /reservation fee refunded in full\.$/m);
});

test('a zero-hour window is treated as forfeit, not as "cancel 0 hours ahead"', () => {
  const text = flatten(settings({ 'booking.cancellationHours': 0 }));
  assert.doesNotMatch(text, /0 hours/);
  assert.match(text, /not refundable once a booking is confirmed/);
});

test('the spa cancelling always refunds, whatever the house policy says', () => {
  for (const policy of ['REFUND', 'FORFEIT'] as const) {
    const sections = buildRefundPolicy(settings({ 'booking.depositOnCancel': policy }));
    const ours = sections.find((s) => s.heading === 'If we cancel on you');
    assert.ok(ours, `missing section for ${policy}`);
    assert.match(ours.body.join(' '), /refunded in full/);
  }
});

test('a treatment already given invites a complaint without promising money back', () => {
  // Two things have to stay true of this section at once, and it is easy for a
  // later edit to lose either. It must not promise a refund — a written offer
  // on a completed treatment is read as an entitlement and argued with, by
  // exactly the people it was not written for. And it must not slam the door
  // either: the spa does put things right, and a guest who reads a flat "no"
  // stops reading and stops coming.
  const section = buildRefundPolicy(base).find(
    (s) => s.heading === 'Treatments you have already had',
  );
  assert.ok(section, 'the completed-treatment rule must still be stated');
  const text = [...section.body, ...(section.bullets ?? [])].join(' ');

  // States the rule, but as "not automatic" rather than "never".
  assert.match(text, /not refunded automatically/);
  // Invites the complaint and says where it goes.
  assert.match(text, /tell us/i);
  assert.match(text, /branch manager/);
  // Never promises the outcome.
  assert.doesNotMatch(
    text,
    /refund in part or in full|credit toward|will be refunded|at (?:the )?manager'?s? discretion/i,
  );
});

test('the contact details are the ones a guest would actually reach', () => {
  const text = flatten(settings({
    'business.email': 'hello@example.test',
    'business.contact': '+63 900 111 2222',
  }));
  assert.match(text, /hello@example\.test/);
  assert.match(text, /\+63 900 111 2222/);
});

test('the turnaround promise appears and matches the constant', () => {
  const text = flatten(base);
  assert.match(text, new RegExp(`within ${REFUND_DAYS} banking days`));
});

test('every section has a heading and at least one paragraph', () => {
  // An empty section renders as a bare heading with nothing under it, which
  // looks like the page failed to load rather than like a short section.
  for (const section of buildRefundPolicy(base)) {
    assert.ok(section.heading.trim().length > 0);
    assert.ok(section.body.length > 0, `${section.heading} has no body`);
    for (const paragraph of section.body) {
      assert.ok(paragraph.trim().length > 0, `${section.heading} has an empty paragraph`);
    }
  }
});

test('no template placeholder survives into the rendered text', () => {
  // Cheap guard against a settings key being interpolated as a literal, which
  // is the failure mode that puts "undefined" in front of a customer.
  const text = flatten(base);
  assert.doesNotMatch(text, /undefined|null|\{\{|\[object/i);
});
