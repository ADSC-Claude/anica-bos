import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { TIERS } from '../src/lib/tiers';

const SRC = new URL('../src/', import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}${name}`;
    if (statSync(path).isDirectory()) return sources(`${path}/`);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no list of tiers typed out by hand leaves a tier out', () => {
  // The bug this exists to stop, three times over: a list of tier names written
  // as literals, correct on the day, silently wrong the moment a tier is added.
  //
  //   src/app/checkout/actions.ts   z.enum(['BASIC', 'STANDARD', 'COMPLETE'])
  //   src/app/admin/actions.ts      the package transfer, and a template's minTier
  //
  // The first was the worst kind: the landing page sold Luxury at ₱8,000 and the
  // checkout refused the order as a bad tier. Nothing failed in CI, nothing
  // failed in a build, and the only way to find it was to try to buy the thing.
  //
  // So: a line naming two tiers has to name them all, or be TIERS itself. The
  // fix is always the same — read TIERS.
  const offenders: string[] = [];

  // An enumeration, not a mention: two tier names side by side separated by a
  // comma or a pipe — `['BASIC', 'STANDARD']`, `'STANDARD' | 'COMPLETE'`. A
  // line that merely names one, like `tierAtLeast(tier, 'COMPLETE')` or
  // `tier !== 'BASIC'`, is a comparison and is none of this test's business.
  const quoted = `['"](${TIERS.join('|')})['"]`;
  const pair = new RegExp(`${quoted}\\s*[,|]\\s*${quoted}`);

  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!pair.test(line)) return;
      const named = TIERS.filter((t) => line.includes(`'${t}'`) || line.includes(`"${t}"`));
      if (named.length === TIERS.length) return;
      offenders.push(`${file.slice(SRC.length)}:${i + 1}  names ${named.join(', ')} — missing ${TIERS.filter((t) => !named.includes(t)).join(', ')}`);
    });
  }

  assert.deepEqual(offenders, [], `a hand-written tier list is missing a tier:\n  ${offenders.join('\n  ')}`);
});

test('every tier the site sells is one an order can be placed for', () => {
  // The same fact from the other end, in case the list above is ever written
  // across several lines and slips past the scan: what the packages page offers
  // and what the checkout accepts are the same set, always.
  const schema = readFileSync(`${SRC}app/checkout/actions.ts`, 'utf8');
  assert.match(schema, /tier: z\.enum\(TIERS/, 'the checkout no longer validates the tier against TIERS');
});
