/**
 * A box that asks to be narrow has to be allowed to be narrow.
 *
 * `.field` gives every box on the site its width, its padding and its
 * border. Tailwind's utilities live in the `utilities` cascade layer, and a
 * layer is weighed before specificity is even looked at — un-layered CSS
 * beats a layered rule however plain the selector is and however the source
 * is ordered. So while `.field { width: 100% }` sat outside a layer, a
 * `w-28` beside it did nothing at all.
 *
 * What that looked like: "why does the parents looks like this?" — a 320px
 * "Mr." dropdown filling the row and a 26px sliver where the name goes,
 * because the select would not shrink and the input had to give up the
 * space. Measured in a browser before the fix, and again after: 112px and
 * 200px, which is what the markup asks for.
 *
 * The width now sits in `components`, which Tailwind orders before
 * `utilities`. This is the guard: it is a one-line change to undo by
 * accident, and the damage shows up three steps into a form nobody looks at
 * on every deploy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Comments come out first: the note explaining this very rule quotes
// `.field { width: 100% }`, and a scanner that reads prose finds faults in it.
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of `@layer <name> { … }`, brace-counted so nested rules survive. */
function layer(name: string): string {
  const open = css.indexOf(`@layer ${name} {`);
  if (open < 0) return '';
  let i = css.indexOf('{', open);
  const from = i + 1;
  for (let depth = 0; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(from, i);
  }
  return '';
}

test('the width a box gets by default is layered, so a utility can beat it', () => {
  const components = layer('components');
  assert.ok(components, 'there is a components layer to put it in');
  assert.match(components, /\.field\s*\{[^}]*width:\s*100%/, '.field takes its width inside the components layer');
});

test('no rule outside a layer sets a width on .field', () => {
  // The stylesheet with every `@layer … { … }` body cut out: what is left is
  // un-layered, and un-layered is what beats the utilities.
  let unlayered = '';
  for (let i = 0; i < css.length; ) {
    const at = css.indexOf('@layer', i);
    const open = at < 0 ? -1 : css.indexOf('{', at);
    if (at < 0 || open < 0) { unlayered += css.slice(i); break; }
    unlayered += css.slice(i, at);
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }

  for (const m of unlayered.matchAll(/(^|\n)([^\n{}]*\.field[^\n{}]*)\{([^}]*)\}/g)) {
    assert.doesNotMatch(
      m[3]!,
      /(^|[;\s])width\s*:/,
      `an un-layered width on "${m[2]!.trim()}" will beat every Tailwind width utility`,
    );
  }
});
