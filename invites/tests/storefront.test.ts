import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES } from '../prisma/templates';
import { templateData } from '../prisma/templates';

/**
 * The shop closed, and the promise that closing it is not the same as going
 * dark.
 *
 * This is a test of the *pages*, not of a function, because the whole bug it
 * guards against is a page that forgot to ask. `site.comingSoon` shipped
 * guarding exactly one page while the gallery, the occasion pages, the
 * collections and the entire checkout stayed open to anybody with the
 * address — and the checkout is the one with the prices behind it.
 *
 * So: every page that browses or sells asks, and the pages a guest, a
 * customer mid-build or the staff depend on never do. The second half is the
 * important half. Somebody's invitation went out to three hundred people;
 * taking it down because we are not selling this week would be the worst
 * thing this switch could do.
 */
const APP = join(import.meta.dirname, '..', 'src', 'app');
const read = (...p: string[]) => readFileSync(join(APP, ...p), 'utf8');

/** Every page.tsx under src/app, as its route. */
function routes(dir = APP, at = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routes(full, `${at}/${name}`));
    else if (name === 'page.tsx') out.push(at || '/');
  }
  return out;
}

/**
 * Whether this page turns a visitor away when the shop is closed.
 *
 * The guard, or the redirect the landing page has always done by hand — not
 * a mention of the setting, because the Settings page carries the very
 * checkbox that switches it and reads it to draw the tick. Naming a thing is
 * not doing it.
 */
const asks = (route: string) => {
  const body = read(...route.split('/').filter(Boolean), 'page.tsx');
  return body.includes('closedForNow()') || body.includes("redirect('/coming-soon')");
};

test('every page that browses or sells closes with the shop', () => {
  for (const route of ['/', '/templates', '/occasions', '/occasions/[key]', '/collections/[key]', '/checkout', '/signup']) {
    assert.ok(asks(route), `${route} does not ask whether the shop is closed`);
  }
});

test('a guest, a customer and the staff are never shut out', () => {
  // a guest's invitation, its personal link and its printable sheet: delivered, not on sale
  for (const route of ['/[slug]', '/[slug]/[token]', '/[slug]/print']) {
    assert.equal(asks(route), false, `${route} must not close with the shop`);
  }
  // the way in, an account that already exists, and the promises
  for (const route of ['/login', '/account', '/privacy', '/terms', '/refund-policy']) {
    assert.equal(asks(route), false, `${route} must not close with the shop`);
  }
  // and every page of the admin, which is what the shop is closed for
  for (const route of routes().filter((r) => r.startsWith('/admin'))) {
    assert.equal(asks(route), false, `${route} must not close with the shop`);
  }
});

/**
 * Nothing is on sale at the moment, and both shipped designs are retired
 * rather than deleted — the row stays, the document stays, the demo keeps
 * rendering, and taking the word off the list puts either back.
 */
test('the two shipped designs are off the shop floor, and recoverable', () => {
  const capiz = TEMPLATES.find((t) => t.slug === 'capiz');
  const babyBlue = TEMPLATES.find((t) => t.slug === 'baby-blue');
  // still in the catalogue, so every invitation built on them keeps rendering
  assert.ok(capiz, 'Capiz must stay in the catalogue');
  assert.ok(babyBlue, 'Baby Blue must stay in the catalogue');
  assert.equal(capiz!.retired, true);
  assert.equal(babyBlue!.retired, true);
  // and off the shop floor, which is what the sync writes
  assert.equal(templateData(capiz!, 0).published, false);
  assert.equal(templateData(babyBlue!, 1).published, false);
  // their designs are untouched: a retired design is not an emptied one
  assert.ok(capiz!.design, 'Capiz keeps its document');
  // nothing at all is on sale
  assert.equal(TEMPLATES.filter((t) => !t.retired).length, 0);
});

/**
 * The guest's list of parts, and the one trap in its stylesheet.
 *
 * Its backdrop is a `position: fixed` child of the button's own container,
 * so it only covers the screen while nothing above it is transformed — a
 * transformed element becomes the containing block for fixed descendants,
 * and then `inset: 0` means that element's box instead of the viewport. A
 * rise added to the fade did exactly that: the backdrop came back the size
 * of the button, and a tap on the artwork stopped closing the sheet. It
 * looks harmless in the CSS and it is not, so it is written down here.
 */
test('nothing over the guest’s list of parts is transformed', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.inv-contents {'));
  const fade = block.slice(block.indexOf('@keyframes inv-contents-in'), block.indexOf('@keyframes inv-contents-in') + 200);
  assert.doesNotMatch(fade, /transform/, 'a transform here re-parents the backdrop and the outside tap stops closing');
  // and the button has to sit above the backdrop, which is a later sibling
  assert.match(block, /\.inv-contents-open \{\s*position: relative;\s*z-index: 2;/, 'the backdrop will cover its own button');
  // paper does not scroll
  assert.match(css, /@media print \{ \.inv-contents \{ display: none; \} \}/);
});

/**
 * A booklet is never hidden unless the hub is known to work.
 *
 * The property being guarded is the one that keeps an invitation whole. The
 * server lays a booklet's pages in the column, and `Hub` takes them out of
 * it only after it has found an object that really opens one. So an
 * unconditional `display: none` on `.inv-booklet` anywhere in this
 * stylesheet is a guest with no JavaScript — or a crawler, or a printed
 * page, or a script that threw — reading an invitation with a third of it
 * missing, and nothing about the page would say so.
 */
test('a booklet only leaves the column once the hub is on', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  // every rule that hides or moves a booklet is behind the attribute
  for (const m of css.matchAll(/^([^\n{]*\.inv-booklet[^\n{]*)\{/gm)) {
    const sel = m[1];
    if (/\.inv-booklet-back/.test(sel)) continue;
    assert.match(sel, /\[data-hub\]/, `a booklet rule outside the hub: ${sel.trim()}`);
  }
  // and paper, which has nothing to tap, prints every one of them
  assert.match(css, /@media print \{[\s\S]*?\.inv\[data-hub\] \.inv-booklet,[\s\S]*?display: block; position: static;/);
});

/**
 * The same trap as the jump menu's fade, written down a second time because
 * it is the same two lines and the same afternoon lost. `both` leaves the
 * animated properties resolved; a resolved `transform` makes the element a
 * containing block for its own `position: fixed` children. An opacity is
 * only a stacking context, so this fade is safe — a transform would not be.
 */
test('nothing about an opening booklet is transformed', () => {
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const at = css.indexOf('@keyframes inv-booklet-in');
  assert.ok(at > 0, 'the fade is gone');
  assert.doesNotMatch(css.slice(at, at + 200), /transform/);
});
