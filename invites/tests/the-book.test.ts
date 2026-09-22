/**
 * SHOW ALL MESSAGES: the book on a page of its own.
 *
 * "Can the messages they leave can have a button where they can read all the
 * messages like 'show all messages' in a separate tab not in the main page."
 *
 * The wall on the invitation holds three so the celebration keeps its
 * drawn length. The rest were reachable only from the couple's Guestbook
 * tab, which is not a guest's to open — so the main reason a guestbook is
 * on a page at all, that guests read what everybody wrote, did not work.
 *
 * It is a page, not an expanding section: /{slug}/messages, and
 * /{slug}/{token}/messages for a guest on their own link, so the way back
 * does not strip the link they arrived on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOW_MESSAGES } from '../src/lib/showlist';
import { BOOK_CEILING } from '../src/lib/invitations';
import { invitationPath } from '../src/lib/app-url';
import { t } from '../src/lib/copy';

test('the wall still holds three, and the page holds the rest', () => {
  assert.equal(SHOW_MESSAGES, 3);
  assert.ok(BOOK_CEILING > SHOW_MESSAGES, 'the book is longer than the wall');
});

test('the link is only offered when the page has more to show', () => {
  // Three or fewer and the wall is already showing all of them, so a page
  // would show nothing new. Same condition the old "and N more" line used,
  // and the empty line keeps the same height so the form does not shift.
  const src = readFileSync('src/components/invite/renderer.tsx', 'utf8');
  const fn = src.slice(src.indexOf('function Guestbook({'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /\{more === 0 \? \(/, 'nothing offered when the wall holds them all');
  assert.match(body, /guestbook\.showAll/, 'the link is the showAll copy');
  assert.match(body, /invitationPath\(inv\.slug, token\)\}\/messages/, 'and it keeps the guest\'s token');
  // In ink it goes back to being a statement: the old "and N more" line
  // sits in the print branch, ahead of the link the screen gets.
  const printAt = body.indexOf(') : print ? (');
  const moreAt = body.indexOf("guestbook.more");
  const linkAt = body.indexOf("guestbook.showAll");
  assert.ok(printAt > 0, 'there is a print branch');
  assert.ok(moreAt > printAt && moreAt < linkAt, 'paper keeps the old statement, the screen gets the link');
});

test('both ways in exist, and the token one keeps the token', () => {
  assert.equal(`${invitationPath('christening-of-azriel-cayden')}/messages`, '/christening-of-azriel-cayden/messages');
  assert.equal(
    `${invitationPath('christening-of-azriel-cayden', 'abc123')}/messages`,
    '/christening-of-azriel-cayden/abc123/messages',
    'a guest on a personal link goes to their own book, so Back returns them to their own invitation',
  );
});

test('the page is asked not to be indexed — they are guests\' own words', () => {
  for (const f of ['src/app/[slug]/messages/page.tsx', 'src/app/[slug]/[token]/messages/page.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /robots:\s*\{\s*index:\s*false/, `${f} sets noindex`);
  }
});

test('the page refuses what the invitation refuses, by resolving it the same way', () => {
  // The gates are not a second set to keep in step with the invitation's:
  // the page calls the same resolveInvitation, so a draft stays its owner's,
  // an expired link says so, and a password shows the password form.
  const src = readFileSync('src/app/[slug]/shared.tsx', 'utf8');
  const fn = src.slice(src.indexOf('export async function MessagesPage'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /resolveInvitation\(slug, token\)/, 'resolves the invitation the shared way');
  assert.match(body, /if \(locked\) return <PasswordGate/, 'a password is asked for');
  assert.match(body, /ExpiredNotice/, 'an expired invitation says so');
  assert.match(body, /bool\(content\.guestbook, 'enabled'\)/, 'no guestbook, no page');
  assert.match(body, /allWishes\(invitation\.id\)/, 'approved wishes only, via allWishes');
});

test('only approved wishes are loaded', () => {
  const src = readFileSync('src/lib/invitations.ts', 'utf8');
  const fn = src.slice(src.indexOf('export async function allWishes'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /approved: true/, 'a wish waiting for approval is not in the book');
  assert.match(body, /orderBy: \{ createdAt: 'desc' \}/, 'newest first, as the wall reads');
  assert.match(body, /take: BOOK_CEILING/, 'bounded');
});

test('every word of it is written in both languages', () => {
  for (const key of ['guestbook.showAll', 'guestbook.oneMessage', 'guestbook.someMessages', 'guestbook.backToInvitation'] as const) {
    for (const lang of ['en', 'tl'] as const) {
      const line = t(lang, key, { n: 5 });
      assert.ok(line.length > 0, `${key} in ${lang}`);
      assert.ok(!line.includes('{n}'), `${key} in ${lang} filled its count in`);
    }
  }
  assert.match(t('en', 'guestbook.someMessages', { n: 5 }), /\b5\b/);
  // One message is not "1 messages".
  assert.doesNotMatch(t('en', 'guestbook.oneMessage'), /\d/);
});
