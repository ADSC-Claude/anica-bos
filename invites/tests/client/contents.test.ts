import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Contents } from '../../src/components/invite/client';

const parts = [
  { id: 'top', label: 'Cover' },
  { id: 'ceremony', label: 'Church & Mass' },
  { id: 'sponsors', label: 'Ninongs & Ninangs' },
  { id: 'rsvp', label: 'RSVP' },
];

// createElement rather than calling it: it holds state, so React has to be
// the one rendering it or the hooks have no owner.
const html = (p: typeof parts) =>
  renderToStaticMarkup(createElement(Contents, { parts: p, label: 'Jump to', closeLabel: 'Close' }));

/**
 * The list is a client component and has to load outside a server one: it
 * carries state and an effect, and the guest page that renders it is a
 * server component, so a stray `server-only` import anywhere beneath it
 * would only show up here. `npm test` runs under `--conditions=react-server`
 * where that module is empty; this run does not.
 */
test('the guest’s list of parts loads outside a server component', () => {
  const out = html(parts);
  assert.match(out, /Jump to/);
  // closed at rest: the artwork is what a guest should meet first, and a
  // sheet standing open over it on arrival is the thing this must not do
  assert.doesNotMatch(out, /Ninongs/, 'the sheet is open before anybody asked');
  assert.match(out, /aria-expanded="false"/);
  assert.match(out, /aria-controls="inv-contents-list"/);
});

/**
 * A list of one is not a list. An invitation cut down to a cover and an RSVP
 * — a Save the Date's near neighbour — would otherwise get a button that
 * offers the page it is already on.
 */
test('a list worth having, or none at all', () => {
  assert.equal(html([]), '');
  assert.equal(html([parts[0]]), '');
  assert.notEqual(html(parts.slice(0, 2)), '', 'two parts is a real choice');
});

/**
 * It takes the design's own ink, paper and faces from the stylesheet rather
 * than colours of its own, so it reads as part of the invitation. What it
 * must never do is carry a colour inline, which would override the design.
 */
test('the list brings no colours of its own', () => {
  const out = html(parts);
  assert.doesNotMatch(out, /style="/, 'an inline style would beat the design’s own variables');
  assert.match(out, /class="inv-contents"/);
});
