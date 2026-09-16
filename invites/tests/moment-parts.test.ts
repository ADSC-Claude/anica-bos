import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artOf } from '../src/lib/design';
import { MOMENT_PARTS, MOMENT_BY_KEY, PARTED, aspectOf, partUrl } from '../src/lib/moments';

test('every photographed part is named for its scene, shipped under /moments, and the file is there', () => {
  for (const p of MOMENT_PARTS) {
    assert.ok(p.key.startsWith(`${p.scene}/`), p.key);
    assert.equal(p.url, `/moments/${p.key}.webp`);
    assert.ok(existsSync(join(process.cwd(), 'public', p.url)), `missing ${p.url}`);
    assert.ok(p.aspect > 0);
    if (p.hole) {
      assert.ok(p.hole.left + p.hole.width <= 100);
      assert.ok(p.hole.top + p.hole.height <= 100);
    }
  }
});

test('a scene that stands on parts has some, the stack borrowing the print', () => {
  for (const k of Object.keys(PARTED) as (keyof typeof MOMENT_BY_KEY)[]) {
    assert.ok(MOMENT_BY_KEY[k], k);
    assert.ok(MOMENT_PARTS.some((p) => p.scene === (k === 'polaroid-stack' ? 'instant-camera' : k)), k);
  }
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
