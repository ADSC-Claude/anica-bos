import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artOf } from '../src/lib/design';
import { MOMENT_PARTS, MOMENTS, MOMENT_BY_KEY, PARTED, aspectOf, partUrl } from '../src/lib/moments';

test('every photographed part is a scene/part key, shipped under /moments, and the file is there', () => {
  for (const p of MOMENT_PARTS) {
    assert.match(p.key, /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/, p.key);
    // it names the scenes that draw it, and each is a scene we have
    assert.ok(p.scenes.length > 0, p.key);
    for (const k of p.scenes) assert.ok(MOMENT_BY_KEY[k], `${p.key} names ${k}`);
    assert.equal(p.url, `/moments/${p.key}.webp`);
    assert.ok(existsSync(join(process.cwd(), 'public', p.url)), `missing ${p.url}`);
    assert.ok(p.aspect > 0);
    if (p.hole) {
      assert.ok(p.hole.left + p.hole.width <= 100);
      assert.ok(p.hole.top + p.hole.height <= 100);
    }
  }
});

test('every scene stands on photographed parts, and PARTED says so', () => {
  // the catalogue leaves no scene drawn from nothing: each one is named by some part
  for (const m of MOMENTS) {
    assert.ok(MOMENT_PARTS.some((p) => p.scenes.includes(m.key)), `${m.key} has no part`);
    assert.equal(PARTED[m.key], true, m.key);
  }
  // and PARTED names nothing that is not a scene
  for (const k of Object.keys(PARTED) as (keyof typeof MOMENT_BY_KEY)[]) assert.ok(MOMENT_BY_KEY[k], k);
});

test('a part shared by several scenes is listed once and drawn by each', () => {
  const card = MOMENT_PARTS.find((p) => p.key === 'envelope/card');
  assert.ok(card);
  for (const k of ['envelope', 'seal', 'ribbon', 'letter', 'pull-card', 'flip'] as const) assert.ok(card.scenes.includes(k), k);
  // the stack draws the camera's print rather than a print of its own
  assert.ok(MOMENT_PARTS.find((p) => p.key === 'instant-camera/print')?.scenes.includes('polaroid-stack'));
  assert.equal(MOMENT_PARTS.filter((p) => p.key === 'instant-camera/print').length, 1);
});

test("a design's own part stands in for the shipped one; a blank keeps the shipped one", () => {
  assert.equal(partUrl('seal/wax'), '/moments/seal/wax.webp');
  assert.equal(partUrl('seal/wax', { 'seal/wax': '/uploads/x.webp' }), '/uploads/x.webp');
  assert.equal(partUrl('seal/wax', { 'seal/wax': '' }), '/moments/seal/wax.webp');
});

test('the church doors take the arch\'s proportions; every other scene keeps its own', () => {
  assert.ok(Math.abs(aspectOf('doors', 'church') - 1134 / 760) < 1e-9);
  assert.equal(aspectOf('doors'), MOMENT_BY_KEY.doors.aspect);
  assert.equal(aspectOf('instant-camera'), 1.45);
});

test('artOf keeps parts by a scene/part key with a real address, and nothing else', () => {
  const art = artOf({ parts: { 'seal/wax': '/uploads/wax.webp', 'doors/arch': 'https://cdn.example/arch.webp', nope: '/x.webp', 'seal/wax/extra': '/y.webp', 'curtains/panel': 'javascript:alert(1)', 'doors/leaf-l': '' } });
  assert.deepEqual(art.parts, { 'seal/wax': '/uploads/wax.webp', 'doors/arch': 'https://cdn.example/arch.webp' });
  assert.equal(artOf({ parts: {} }).parts, undefined);
  assert.equal(artOf({}).parts, undefined);
});
