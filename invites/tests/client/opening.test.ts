import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Shell, PageGround, ownerOfPress } from '../../src/components/invite/client';

/**
 * The closed screen, as the server sends it — which is the only version a
 * guest has for the first seconds, and the version that has to behave.
 */
const closed = (music = '/demo/music-box.mp3') =>
  renderToStaticMarkup(
    createElement(Shell, {
      opening: {
        style: 'cinematic', hint: 'TAP TO OPEN', monogram: '', photos: [], line: '', line2: '', names: '', date: '',
        video: '/openings/baby-blue.mp4', poster: '/openings/baby-blue-poster.jpg', words: true, clip: 'baby-blue',
      } as never,
      music,
      playLabel: 'Play',
      pauseLabel: 'Pause',
      children: null,
    }),
  );

test('a tap made before the page is ready is caught, not lost', () => {
  const html = closed();
  // the listener has to be in the markup, because the point of it is to be
  // running before the bundle it would otherwise live in
  assert.match(html, /addEventListener\('pointerdown'/);
  assert.match(html, /data-waiting/);
});

test('the closed screen does not ask for a tap it cannot answer yet', () => {
  const html = closed();
  // data-ready is set on mount and nowhere else, so the server never sends it
  assert.doesNotMatch(html, /data-ready/);
  // and the mark that says the tap was heard is there to be shown
  assert.match(html, /inv-open-wait/);
});

test('neither the song nor the clip is fetched for the first paint', () => {
  const html = closed();
  // both warm at hydration instead: see `warm` in client.tsx
  assert.equal(html.match(/preload="none"/g)?.length, 2);
  assert.doesNotMatch(html, /preload="auto"/);
});

test('an invitation with no song ships no player', () => {
  const html = closed('');
  assert.doesNotMatch(html, /<audio/);
  assert.equal(html.match(/preload="none"/g)?.length, 1);
});

test('the page grounds are asked for in the head, ahead of the decorations', () => {
  const html = renderToStaticMarkup(
    createElement(PageGround, {
      ratio: 1, order: [], last: 0, backgrounds: [],
      grounds: { cover: { url: '/christening/cover.webp', ratio: 1.8, top: '', bottom: '' }, rsvp: { url: '/christening/rsvp.webp', ratio: 1.8, top: '', bottom: '' } },
    }),
  );
  assert.match(html, /rel="preload"[^>]*href="\/christening\/cover\.webp"/);
  assert.match(html, /rel="preload"[^>]*href="\/christening\/rsvp\.webp"/);
});

test('a column that is never laid by number does not ask for the strip', () => {
  // a document of another layout is handed the Capiz strip as a fallback it
  // never uses, and ratio 0 is how it says so
  const html = renderToStaticMarkup(
    createElement(PageGround, { ratio: 0, order: [], last: 0, backgrounds: ['/capiz/bg-1.webp', '/capiz/bg-2.webp'] }),
  );
  assert.doesNotMatch(html, /bg-1\.webp/);
});

/**
 * A press, when things are drawn on top of one another.
 *
 * A drawn page places every element by coordinates, and a booklet is laid
 * over the hub, so what is under the pointer is a stack rather than one
 * thing. The walk down that stack must stop at the first object that owns
 * the press in its own right — otherwise it reaches *past* a link and hands
 * the press to whatever lies behind, which is what left OPEN IN GOOGLE MAPS
 * and OPEN IN WAZE looking alive and doing nothing.
 */
const node = (...matches: string[]): Element =>
  ({ closest: (sel: string) => (matches.some((m) => sel.includes(m)) ? ({} as Element) : null) }) as Element;

test('a press goes to the object under the pointer when nothing above claims it', () => {
  // decoration, then the hub card beneath it: the card gets the press
  const stack = [node(), node('[data-opens]')];
  assert.ok(ownerOfPress(stack, '[data-opens]'));
});

test('a press is never taken from a link lying over the thing underneath', () => {
  // the venue page's OPEN IN WAZE, with a hub card at the same place behind it
  const stack = [node('[data-go]', 'a[href]'), node('[data-opens]')];
  assert.equal(ownerOfPress(stack, '[data-opens]'), null);
});

test('the same holds for a tap the design drew, and for the song', () => {
  assert.equal(ownerOfPress([node('[data-music]'), node('[data-opens]')], '[data-opens]'), null);
  assert.equal(ownerOfPress([node('button'), node('[data-taps]')], '[data-taps]'), null);
});

test('an object claims its own press before anything else is considered', () => {
  // the opener is itself in the owned list: matching the selector comes first
  assert.ok(ownerOfPress([node('[data-opens]')], '[data-opens]'));
  assert.ok(ownerOfPress([node('[data-taps]')], '[data-taps]'));
});

test('nothing under the pointer is nothing pressed', () => {
  assert.equal(ownerOfPress([], '[data-opens]'), null);
  assert.equal(ownerOfPress([node(), node()], '[data-opens]'), null);
});
