import test from 'node:test';
import assert from 'node:assert/strict';
import { albumProblem, guestPhotoSchema, photoLimit } from '../src/lib/photos';
import { PHOTO_MAX_LABEL, PHOTO_TYPES, PHOTOS_AT_ONCE } from '../src/lib/album';
import { t } from '../src/lib/copy';
import { SECTION_BY_KEY } from '../src/lib/sections';
import { ADDONS } from '../src/lib/addon-catalogue';
import { defaultContent } from '../src/lib/sections';
import { hasFeature } from '../src/lib/tiers';

function invitation(tier: 'BASIC' | 'STANDARD' | 'COMPLETE' | 'LUXURY', photos: Record<string, unknown>, addOns: string[] = []) {
  return { tier, addOns, content: { ...defaultContent('WEDDING'), photos } };
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

test('the album add-on opens it on a package that does not include it', () => {
  // What buying one means: the same album, on Standard, for ₱1,000.
  const open = { enabled: true, moderated: true };
  assert.equal(albumProblem(invitation('STANDARD', open, ['PHOTO_SHARING'])), null);
  assert.equal(albumProblem(invitation('BASIC', open, ['PHOTO_SHARING'])), null);
  // and only that add-on — another one does not open it
  assert.match(String(albumProblem(invitation('STANDARD', open, ['PASSWORD']))), /does not have a shared album/);
  // It still has to be switched on, bought or included.
  assert.match(String(albumProblem(invitation('BASIC', { enabled: false }, ['PHOTO_SHARING']))), /closed/);
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

test('a guest on the venue wifi is not refused for what the room sent', () => {
  // The bug this exists to stop. A reception is one public address for every
  // phone in the room, so counting by address made the hourly allowance the
  // whole party's: the guest who happened to send the one over the line was
  // told they had sent too many, at the exact moment the album is for.
  const room = { guest: 3, ip: 500, invitationHour: 10, invitationTotal: 10 };
  assert.equal(photoLimit(room), null, 'a named guest is counted as themselves, not as the room');

  // Without a personal link there is nothing else to count by, so the address
  // still holds — but it is sized as a room's allowance now, not a person's.
  assert.equal(photoLimit({ guest: null, ip: 20, invitationHour: 20, invitationTotal: 20 }), null);
  const crowded = photoLimit({ guest: null, ip: 120, invitationHour: 120, invitationTotal: 120 });
  assert.equal(crowded?.status, 429);
  assert.match(String(crowded?.message), /from this network/, 'and says it is the network, not you');
});

test('each ceiling says whose allowance ran out, and whether waiting helps', () => {
  // A full album is permanent: offering "in a few minutes" would be a lie.
  const full = photoLimit({ guest: 0, ip: 0, invitationHour: 0, invitationTotal: 500 });
  assert.equal(full?.status, 400);
  assert.match(String(full?.message), /full/);
  assert.doesNotMatch(String(full?.message), /minutes|little while/);

  // One guest sending far too many is still their own doing.
  const person = photoLimit({ guest: 40, ip: 40, invitationHour: 40, invitationTotal: 40 });
  assert.equal(person?.status, 429);
  assert.match(String(person?.message), /a lot of photos at once/);

  // And one album filling fast is the album's, whoever is sending.
  const burst = photoLimit({ guest: 1, ip: 1, invitationHour: 200, invitationTotal: 200 });
  assert.equal(burst?.status, 429);
  assert.match(String(burst?.message), /This album is receiving/);

  // Every refusal is one a phone can show and a person can act on.
  for (const c of [full, person, burst, crowdedCounts()]) {
    assert.ok(c && c.message.trim().length > 20 && /\.$/.test(c.message));
  }
});

function crowdedCounts() {
  return photoLimit({ guest: null, ip: 120, invitationHour: 120, invitationTotal: 120 });
}

test('an ordinary evening is never refused', () => {
  // 150 guests, a few photos each, all on one wifi, over an hour: the shape the
  // limits exist to allow.
  assert.equal(photoLimit({ guest: 5, ip: 119, invitationHour: 180, invitationTotal: 300 }), null);
});

test('what the album says it takes is what it takes', () => {
  // Copy about a limit that has drifted from the limit is worse than no copy:
  // a guest reads "up to 10 MB", picks a 12 MB photo believing it is fine, and
  // is refused. So the sentences under the file chooser and in the builder are
  // checked against the numbers the storage layer actually enforces.
  for (const lang of ['en', 'tl'] as const) {
    const accepts = t(lang, 'photos.accepts', { max: PHOTO_MAX_LABEL });
    assert.ok(accepts.includes(PHOTO_MAX_LABEL), `${lang} names the real size limit`);
    assert.doesNotMatch(accepts, /\{max\}/, `${lang} leaves no placeholder showing`);
    assert.match(accepts, /JPEG/i);
    assert.match(accepts, /PNG/i);
    assert.match(accepts, /WebP/i);
    assert.match(accepts, /video/i, `${lang} says video is not taken`);
  }

  // Every format named is one the storage layer really accepts, and every one
  // it accepts is named: a guest told "JPEG, PNG or WebP" who owns a HEIC is
  // owed the same warning as one who owns a clip.
  assert.deepEqual([...PHOTO_TYPES].sort(), ['image/jpeg', 'image/png', 'image/webp']);
});

test('the builder tells the couple the same thing, in the same numbers', () => {
  // They are the ones a guest asks. If the builder and the upload form
  // disagree, the couple tells their guests something the album will refuse.
  const photos = SECTION_BY_KEY.photos.description;
  assert.match(photos, new RegExp(`\\b${PHOTOS_AT_ONCE}\\b`), 'how many at a time');
  assert.ok(photos.includes(PHOTO_MAX_LABEL), 'how large each may be');
  assert.match(photos, /not video/i, 'and that video is not taken');
});

test('the add-on says photographs, where somebody is deciding whether to buy it', () => {
  const album = ADDONS.find((a) => a.code === 'PHOTO_SHARING');
  assert.ok(album, 'the album is not in the catalogue');
  assert.match(album.description, /not video/i);
  assert.match(album.description, /download/i, 'and that they can keep them afterwards');
});
