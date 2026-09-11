import test from 'node:test';
import assert from 'node:assert/strict';
import { albumProblem, guestPhotoSchema } from '../src/lib/photos';
import { defaultContent } from '../src/lib/sections';
import { hasFeature } from '../src/lib/tiers';

function invitation(tier: 'BASIC' | 'STANDARD' | 'COMPLETE' | 'LUXURY', photos: Record<string, unknown>) {
  return { tier, content: { ...defaultContent('WEDDING'), photos } };
}

test('the album is a Luxury feature, whatever the section says', () => {
  const open = { enabled: true, moderated: true };
  assert.equal(albumProblem(invitation('LUXURY', open)), null);
  // It was Signature's until Luxury was added above it. A package that no
  // longer carries the album must say so rather than collect into a page the
  // couple cannot show.
  assert.match(String(albumProblem(invitation('COMPLETE', open))), /does not have a shared album/);
  assert.match(String(albumProblem(invitation('STANDARD', open))), /does not have a shared album/);
  assert.match(String(albumProblem(invitation('BASIC', open))), /does not have a shared album/);
});

test('a Luxury invitation with the album switched off is closed, not open', () => {
  assert.match(String(albumProblem(invitation('LUXURY', { enabled: false }))), /closed/);
  // The default is off: an album nobody asked for should not start collecting.
  assert.match(String(albumProblem(invitation('LUXURY', defaultContent('WEDDING').photos ?? {}))), /closed/);
});

test('the tier gate agrees with the feature table the pricing page reads', () => {
  assert.equal(hasFeature('LUXURY', 'photoSharing'), true);
  assert.equal(hasFeature('COMPLETE', 'photoSharing'), false);
  assert.equal(hasFeature('STANDARD', 'photoSharing'), false);
});

test('an upload needs a name and rejects the honeypot', () => {
  assert.equal(guestPhotoSchema.safeParse({ slug: 'juan-and-maria', name: 'Tita Baby' }).success, true);
  assert.equal(guestPhotoSchema.safeParse({ slug: 'juan-and-maria', name: '   ' }).success, false);
  assert.equal(guestPhotoSchema.safeParse({ slug: 'juan-and-maria', name: 'Bot', website: 'http://spam' }).success, false);
});

test('captions and names are capped, and whitespace is trimmed', () => {
  const long = guestPhotoSchema.safeParse({ slug: 's', name: 'x', caption: 'c'.repeat(281) });
  assert.equal(long.success, false);
  const ok = guestPhotoSchema.safeParse({ slug: 's', name: '  Camille  ', caption: '  First dance  ' });
  assert.equal(ok.success && ok.data.name, 'Camille');
  assert.equal(ok.success && ok.data.caption, 'First dance');
});

test('a personal-link token is optional but bounded', () => {
  assert.equal(guestPhotoSchema.safeParse({ slug: 's', name: 'x' }).success, true);
  assert.equal(guestPhotoSchema.safeParse({ slug: 's', name: 'x', token: 'a'.repeat(81) }).success, false);
});
