import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RESERVED_SLUGS } from '../src/lib/invitations';

/**
 * Invitations live at the site root — /angelica-and-jeffrey, not
 * /i/angelica-and-jeffrey — so a slug that matches a top-level route is
 * shadowed by that route and the invitation becomes unreachable. A couple
 * named "Terms" would lose their page to the terms page, and nobody would
 * find out until a guest tapped the link.
 *
 * So the reserved list is checked against what is actually on disk rather
 * than against somebody's memory of it. Adding a top-level page and
 * forgetting the list is the entire failure mode this exists to catch.
 */
const APP = join(import.meta.dirname, '..', 'src', 'app');

test('every top-level route is a reserved slug', () => {
  const routes = readdirSync(APP)
    .filter((name) => statSync(join(APP, name)).isDirectory())
    // [slug] is the invitation route itself, not a name a slug could collide with.
    .filter((name) => !name.startsWith('[') && !name.startsWith('_'));

  const missing = routes.filter((r) => !RESERVED_SLUGS.has(r));
  assert.deepEqual(missing, [], `top-level routes missing from RESERVED_SLUGS: ${missing.join(', ')}`);
});

test('the files that serve their own path are reserved too', () => {
  // robots.ts and sitemap.ts serve /robots.txt and /sitemap.xml.
  for (const served of ['robots.txt', 'sitemap.xml']) {
    assert.ok(RESERVED_SLUGS.has(served), `${served} must be reserved`);
  }
});

test('the old guest prefix stays reserved while it redirects', () => {
  assert.ok(RESERVED_SLUGS.has('i'), '/i/:path* still redirects, so "i" cannot be a slug');
});
