import test from 'node:test';
import assert from 'node:assert/strict';
import { phMobile, formatPhMobile, creditsFor } from '../src/lib/sms';

test('every way a Filipino writes their own number normalises to one thing', () => {
  for (const raw of [
    '09171234567',
    '0917 123 4567',
    '0917-123-4567',
    '+639171234567',
    '+63 917 123 4567',
    '639171234567',
    '9171234567',
    ' (0917) 123 4567 ',
  ]) {
    assert.equal(phMobile(raw), '639171234567', raw);
  }
});

test('what is not a Philippine mobile is refused rather than sent and charged for', () => {
  for (const raw of [
    '',
    '   ',
    '02 8123 4567', // Manila landline
    '+1 415 555 2671', // foreign
    '0917123456', // one digit short
    '091712345678', // one too many
    '08171234567', // not a mobile prefix
    'ask my mom',
  ]) {
    assert.equal(phMobile(raw), null, raw);
  }
});

test('the number is shown back the way it was typed in, not the way it is sent', () => {
  assert.equal(formatPhMobile('639171234567'), '0917 123 4567');
});

test('credits follow the GSM segment rule, so a long template is visibly expensive', () => {
  assert.equal(creditsFor(''), 0);
  assert.equal(creditsFor('Hi!'), 1);
  assert.equal(creditsFor('x'.repeat(160)), 1);
  assert.equal(creditsFor('x'.repeat(161)), 2);
  assert.equal(creditsFor('x'.repeat(306)), 2);
  assert.equal(creditsFor('x'.repeat(307)), 3);
});

test('one emoji drops the whole message to the UCS-2 allowance', () => {
  // The cliff: the same text, one character longer, costs three times as much.
  const plain = 'Hi Tita Baby! Juan & Maria would love to know if you can make it on 12 December 2026. Please RSVP here: https://example.com/i/juan-and-maria/abcdefgh';
  assert.equal(creditsFor(plain), 1);
  assert.equal(creditsFor(`${plain} 🎉`), 3);

  assert.equal(creditsFor('🎉'), 1);
  assert.equal(creditsFor('ñ'.repeat(160)), 1, 'ñ is in the GSM alphabet — a Filipino name is not a surcharge');
  assert.equal(creditsFor('日'.repeat(70)), 1);
  assert.equal(creditsFor('日'.repeat(71)), 2);
});

test('GSM extension characters cost two septets each', () => {
  assert.equal(creditsFor('['.repeat(80)), 1);
  assert.equal(creditsFor('['.repeat(81)), 2, '81 brackets is 162 septets, over the 160 allowance');
});
