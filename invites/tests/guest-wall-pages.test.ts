/**
 * The two pages a guest writes on, on the artwork she drew for them.
 *
 * "Iuploaded the new ones, but the guestbook and post event photos does have
 * writings I already have" — so the backgrounds arrived clean and these two
 * pages are laid on them: the torn-paper guestbook, and the Instagram post
 * for the photographs guests send afterwards.
 *
 * Both are `live` pages — the section's own form follows the artwork down
 * the page — which means both grow, and a page that grows stretches its
 * picture. That is the thing that can quietly go wrong here, and it is what
 * most of this file is about: the band of each picture that gets stretched
 * has to be a strip that looks the same however tall it is drawn. The
 * guestbook's is the one gap in her hearts; the post's is the plain white of
 * the card, which is only plain because her heart reactions were lifted out
 * of it into a piece laid back on top.
 *
 * The numbers are all measured off her two files at 1080×1920.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import { SHOW_MESSAGES } from '../src/lib/showlist';
import type { PhotoEl, PictureGround, Source, TextEl } from '../src/lib/design';
import { t } from '../src/lib/copy';

/** the one source shape this file asks about: a writing of the design's own */
const written = (s: Source) => ('fixed' in s ? s : undefined);

const RATIO = 1.7778;
/** her height as a share of her width, so a share of the page's height becomes cqw */
const cqw = (share: number) => share * RATIO;

const page = (key: string) => CHRISTENING_PAGES.find((p) => p.key === key)!;
const guestbook = page('guestbook');
const post = page('post-event');
const ground = (key: string) => page(key).ground as PictureGround;

test('both pages carry the part they are drawn for, and grow with it', () => {
  assert.deepEqual(guestbook.sections, ['guestbook']);
  assert.deepEqual(post.sections, ['photos']);
  for (const p of [guestbook, post]) {
    assert.ok(p.drawn, `${p.key} is drawn`);
    // live without grow is the one combination that cannot work: the form is
    // laid inside the page and nothing has said how tall the page may be.
    assert.ok(p.live && p.grow, `${p.key} is live and grows`);
    assert.ok((p.ground as PictureGround).slices, `${p.key}'s picture is cut in three, because it stretches`);
  }
});

test('the guestbook carries her own two writings, above her icon and below it', () => {
  const [head, line] = ['gb-head', 'gb-line'].map((id) => (guestbook.elements ?? []).find((e): e is TextEl => e.id === id)!);
  /*
   * Off `NEW Guestbook.pdf`, the version of the page with her writings on it:
   * LEAVE A MESSAGE in tracked capitals, her heart-in-a-speech-bubble, and
   * the line under it. The icon on that file sits a little lower than on the
   * clean one she sent to ship (8.13–12.14% against 7.50–11.51%), so both
   * writings are placed off the icon and not off her page — the capitals
   * 2.04% above its head, the line 2.03% below its foot.
   */
  assert.equal(written(head.lines[0]!.sources.at(-1)!)?.fixed.en, 'LEAVE A MESSAGE');
  assert.equal(head.lines[0]!.role, 'eyebrow', 'her capitals are tracked, not a bold title');
  assert.ok(head.y + cqw(0) < 7.50, 'the capitals are above the icon');
  assert.ok(line.y > 11.51 - 1, 'and the line is below it');
  /*
   * "A line for Lucas to read one day": one writing with the answer to one
   * question set inside it, not a fixed line and a bound field side by side,
   * because a line's sources are fallbacks and the second would never show.
   */
  const personal = written(line.lines[0]!.sources[0]!)!;
  assert.equal(personal.fixed.en, 'A line for {name} to read one day');
  assert.deepEqual(personal.fill, { section: 'cover', field: 'childFull', show: 'given' });
  assert.ok(line.lines[0]!.sources.length > 1, 'and a plainer sentence for a cover with no name on it yet');

  // both are above the tear, which is ragged: the tan reaches 20.63% of the
  // page down at its deepest and gives up at 16.82% at its shallowest
  assert.ok(line.y < 16.82, 'her writings are on the paper, not over the tear');
  assert.ok((guestbook.headPad ?? 0) > cqw(20.63), 'and the messages start below the tear at its deepest');
  /*
   * "i just want in a frame of leaving a message, it can be seen."
   *
   * The baby's head starts 82.5% of the way down, which is 336px of her 1920
   * above the foot — 31.1cqw. `footPad` is counted in elevenths of the page's
   * width (`--page-foot × 11cqw`), so 3 is 33cqw: she begins just under the
   * box a guest types in, in the same frame as it.
   *
   * Both bounds matter, and the upper one is the one that was got wrong. Too
   * little and the form is written over her; too much and she is a picture in
   * a band of sky of her own, below the thing a guest is doing rather than
   * part of it — "dont do that its separated".
   */
  const foot = (guestbook.footPad ?? 0) * 11;
  assert.ok(foot > 31.1, 'nothing is typed over the baby');
  assert.ok(foot < 31.1 + 8, 'and she peeks into the frame a guest writes in, not a band of her own');
});

test('the guestbook page is the wall the showlist already describes', () => {
  // Nothing here sets how many messages show: that is `SHOW_MESSAGES`, and the
  // page draws whatever the section hands it. Said out loud because the page
  // is where someone would look for it. "guestbook limits to 3 messages that
  // refreshes everytime the guest messages, only if the customer doesnt have
  // restriction in approvals."
  assert.equal(SHOW_MESSAGES, 3);
  assert.equal((guestbook.elements ?? []).length, 2, 'the page draws her two writings and leaves the rest to the section');
});

test('the post asks for one photograph at a time, with the note under it', () => {
  assert.equal(post.wall, 'swipe');
  // "okay with one single photos that they can swipe, just put a note to
  // swipe so they can see other photos." The note is the section's, not the
  // design's, so it can keep quiet when there is nothing else to swipe to.
  assert.ok(!(post.elements ?? []).some((e) => e.kind === 'text' && /swipe/i.test(JSON.stringify(e))),
    'the design does not draw the note: with one photograph on the wall it would be a note about nothing');
});

test('her heart reactions sit on the photograph, not behind it', () => {
  const hearts = (post.elements ?? []).find((e): e is PhotoEl => e.id === 'pe-hearts')!;
  assert.deepEqual(hearts.bind, { asset: '/christening/parts/post-hearts.webp' });
  /*
   * The artwork is behind the section's markup on a live page (`.inv-bb-art`
   * is laid out under it, the section carries z-index 1), so a piece meant to
   * be seen *over* the photograph has to say so. Three, and not one, because
   * one only reaches the artwork's own stack.
   */
  assert.ok((hearts.z ?? 0) > 1, 'above the section, so the reactions land on the photograph');
  /*
   * And it has to land inside the strip. The strip starts at `headPad` and is
   * as tall as it is wide — the card's inside, 100 − 2 × 5.3 = 89.4cqw.
   */
  const top = post.headPad!;
  const foot = top + 89.4;
  const h = hearts.w! * hearts.aspect!;
  assert.ok(cqw(hearts.y) - h / 2 > top, 'its head is inside the photograph');
  assert.ok(cqw(hearts.y) + h / 2 < foot, 'and so is its foot');
});

test('what stretches in each picture is a strip that can be stretched', () => {
  /*
   * The renderer draws a cut ground as three layers: the head at the top and
   * the foot at the bottom, both at their own height, and the band between
   * them at `100% 100%` behind both. So the band is the only part whose shape
   * changes, and it changes by however much the page grew.
   *
   * The guestbook's band is the one horizontal strip of her sky with no
   * hearts in it (45.00%–52.19% of the page); the post's is the white of the
   * card between its head and its foot. Both are flat colour, so a band drawn
   * ten times its own height looks exactly like the band.
   *
   * This checks the files are there and are the heights those cuts make. What
   * is *in* them was measured when they were cut (`scripts/canva-slices.py`):
   * 0 pixels in either band that are neither her sky nor white.
   */
  for (const [key, head, band] of [['guestbook', 864, 138], ['post-event', 480, 1120]] as const) {
    const g = ground(key);
    assert.deepEqual(g.slices, {
      top: `/christening/${key}-top.webp`,
      mid: `/christening/${key}-mid.webp`,
      foot: `/christening/${key}-foot.webp`,
    });
    for (const part of ['top', 'mid', 'foot'] as const) {
      const file = `public/christening/${key}-${part}.webp`;
      assert.ok(readFileSync(file).length > 200, `${file} is there`);
    }
    // the three tile her 1920 exactly, head + band + foot
    assert.ok(head + band < 1920, `${key}: the band leaves a foot`);
  }
});

/**
 * What a guest is told once the message is away.
 *
 * The form borrowed the RSVP's line for years, so a guest who wrote a wish
 * for the baby was answered with "Your response has been recorded" — which
 * reads like their attendance was just filed, on a page that never asked
 * about attendance. The guestbook says something about the guestbook now.
 *
 * Held here rather than trusted because the wrong line was not a bug anyone
 * could see in a diff: both keys exist, both are polite, and only a guest who
 * actually posts a message ever reads the difference.
 */
test('the guestbook thanks a guest for a message, not for an RSVP', () => {
  for (const lang of ['en', 'tl'] as const) {
    const thanks = t(lang, 'guestbook.thanks');
    assert.notEqual(thanks, t(lang, 'rsvp.thanks'), 'the two pages ask different things');
    assert.ok(thanks.length > 0);
  }
  assert.match(t('en', 'guestbook.thanks'), /message/i, 'it names what was sent');
  assert.match(t('tl', 'guestbook.thanks'), /mensahe/i);
});
