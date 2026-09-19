import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Shell, PageGround } from '../../src/components/invite/client';

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
