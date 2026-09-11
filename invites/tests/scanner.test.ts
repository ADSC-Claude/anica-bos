import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenFromLink } from '../src/lib/guest-sheet';

const scanner = readFileSync(new URL('../src/app/account/invitations/[id]/checkin/scanner.tsx', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../src/app/account/invitations/[id]/checkin/desk.tsx', import.meta.url), 'utf8');

test('a scanned pass resolves to its token, whatever the camera read', () => {
  // The camera hands back whatever is encoded — the whole personal link. The
  // same reader the seat sheet uses turns it into a token.
  const token = 'K7tq2XbNp3Wm9ZaLc8vR';
  assert.equal(tokenFromLink(`https://youreinvitedto.com/liza-and-mark/${token}`), token);
  assert.equal(tokenFromLink(`https://youreinvitedto.com/liza-and-mark/${token}/`), token);
  assert.equal(tokenFromLink('https://example.com/'), '', 'a stray QR on a table napkin resolves to a token');
  assert.match(scanner, /tokenFromLink\(found\.data\)/, 'the scanner parses the link itself again');
});

test('a code from another wedding is refused, not checked in', () => {
  // Last year's pass is still in somebody's photos. It must resolve against
  // this invitation's own guests or say so.
  assert.match(desk, /rows\.find\(\(x\) => x\.token === token\)/, 'a scanned token is not matched against this list');
  assert.match(desk, /not on this guest list/, 'an unknown code fails silently');
});

test('the same code in front of the lens checks somebody in once', () => {
  // A QR sits there for a second or two at thirty frames a second.
  assert.match(scanner, /token === seen/, 'a held code would fire repeatedly');
  assert.match(scanner, /seen = token;/);
});

test('the camera is always released', () => {
  // A live camera left running behind a closed scanner is a light that stays
  // on and a battery that goes flat during the reception.
  assert.match(scanner, /getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/, 'the stream is not stopped');
  assert.match(scanner, /return \(\) => \{ live = false; stop\(\); \};/, 'unmounting leaves the camera on');
  assert.match(scanner, /cancelAnimationFrame/, 'the decode loop runs forever');
  assert.ok(scanner.indexOf('stop();') < scanner.indexOf('onFound(token)'), 'the camera is still running when the screen changes');
});

test('every way a camera can refuse is answered in words, not a stack trace', () => {
  for (const [name, says] of [['NotAllowedError', /blocked/i], ['NotFoundError', /no camera/i]]) {
    assert.match(scanner, new RegExp(name as string), `${name} is not handled`);
    assert.match(scanner, says as RegExp);
  }
  // And every one of them points at the path that still works.
  assert.equal((scanner.match(/paste a scanned link/gi) ?? []).length, 4, 'a failure leaves the coordinator with nothing to do');
});

test('the decoder is only downloaded when somebody opens the scanner', () => {
  // A quarter of a megabyte. The rest of the desk should not pay for it.
  assert.match(scanner, /await import\('jsqr'\)/, 'jsQR is bundled into the page');
  assert.doesNotMatch(scanner, /^import .*jsqr/m, 'jsQR is imported at the top');
});

test('typing still works, and is still offered', () => {
  // The camera is the fast path, not the only one: a companion with no code of
  // their own is found by name, and that has to stay reachable.
  assert.match(desk, /or find them by name/);
  assert.match(desk, /Paste a scanned link, or type a name/);
});
