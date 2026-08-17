/**
 * However the owner writes down a social profile.
 *
 * The failure this prevents is the same one the photo paths had: a value with
 * no scheme is resolved against this site, so "Instagram" in the footer leads
 * to our own 404. It stores cleanly and looks right in the field.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSocialUrl } from '../src/lib/social-url';

const ig = (raw: string | undefined) => {
  const r = normaliseSocialUrl(raw, 'instagram.com');
  return 'error' in r ? `ERROR: ${r.error}` : r.url;
};
const fb = (raw: string) => {
  const r = normaliseSocialUrl(raw, 'facebook.com');
  return 'error' in r ? `ERROR: ${r.error}` : r.url;
};

test('a bare username becomes a profile address', () => {
  assert.equal(ig('anicawellnessspa'), 'https://www.instagram.com/anicawellnessspa');
  assert.equal(ig('@anicawellnessspa'), 'https://www.instagram.com/anicawellnessspa');
  assert.equal(fb('ANICAWellnessSpa'), 'https://www.facebook.com/anicawellnessspa');
});

test('an address missing only its scheme gets one', () => {
  // Typed from memory, or copied out of a printed card.
  assert.equal(ig('instagram.com/anica'), 'https://instagram.com/anica');
  assert.equal(ig('www.instagram.com/anica'), 'https://www.instagram.com/anica');
});

test('a full link is kept, including its query', () => {
  // Facebook's own share links carry ids and parameters that matter.
  assert.equal(
    fb('https://www.facebook.com/profile.php?id=61550000000000'),
    'https://www.facebook.com/profile.php?id=61550000000000',
  );
});

test('http is stored as https, since the network redirects it anyway', () => {
  assert.equal(ig('http://instagram.com/anica'), 'https://instagram.com/anica');
});

test('blank stays blank, and the footer then offers nothing', () => {
  assert.equal(ig(''), '');
  assert.equal(ig('   '), '');
  assert.equal(ig(undefined), '');
});

test('quotes and stray spacing from a paste are dropped', () => {
  assert.equal(ig('"@anica"'), 'https://www.instagram.com/anica');
  assert.equal(ig('  @anica  '), 'https://www.instagram.com/anica');
});

test('a handle is lower-cased, because a capitalised paste reads as a different address', () => {
  assert.equal(ig('@ANICAWellnessSpa'), 'https://www.instagram.com/anicawellnessspa');
});

test('what cannot be a profile is refused rather than guessed at', () => {
  assert.ok(ig('hello@anicawellnessspa.ph').startsWith('ERROR:'), 'an email in the wrong box');
  assert.ok(ig('anica wellness spa').startsWith('ERROR:'), 'a name, not a handle');
  assert.ok(ig('C:\\Users\\Anica\\ig.txt').startsWith('ERROR:'));
  assert.ok(ig('anica/photos/2').startsWith('ERROR:'), 'half a path');
});
