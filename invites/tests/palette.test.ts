import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SWATCHES, PRESETS, MOTIF_MIN, MOTIF_MAX, swatchByHex, swatchName, swatchStyle, swatchHex, presetColours } from '../src/lib/palette';
import { publishProblems, fieldsFor } from '../src/lib/sections';

test('the palette is the designer\'s sheet: thirteen families, a hundred and two named colours, no two alike', () => {
  assert.equal(PALETTE.length, 13);
  assert.equal(SWATCHES.length, 102);
  assert.equal(new Set(SWATCHES.map((s) => s.key)).size, 102, 'keys unique');
  assert.equal(new Set(SWATCHES.map((s) => s.hex)).size, 102, 'colours unique');
  for (const s of SWATCHES) {
    assert.match(s.hex, /^#[0-9a-f]{6}$/, s.key);
    assert.ok(s.name.trim().length > 0, s.key);
  }
  assert.equal(PALETTE.find((g) => g.key === 'metallics')?.swatches.every((s) => s.metallic), true);
});

test('a stored hex finds its name whatever its case; a colour outside the palette has none', () => {
  assert.equal(swatchName('#DBA8A8'), 'Dusty Rose');
  assert.equal(swatchByHex('#a2aa8b')?.name, 'Sage');
  assert.equal(swatchHex('camel'), '#cda480');
  assert.throws(() => swatchHex('no-such-colour'));
  assert.equal(swatchName('#123456'), '');
  assert.equal(swatchStyle('#bccdb8'), '#bccdb8');
  assert.match(swatchStyle('#dcb46b', true), /^linear-gradient/);
  assert.equal(swatchStyle('nonsense', true), 'nonsense');
});

test('the motif is four to eight colours: fewer is a publish problem, once the dress code is filled in', () => {
  assert.equal(MOTIF_MIN, 4);
  assert.equal(MOTIF_MAX, 8);
  const motif = fieldsFor('dressCode', 'WEDDING').find((f) => f.key === 'colors');
  assert.equal(motif?.type, 'swatches');
  assert.equal(motif?.min, 4);
  assert.equal(motif?.max, 8);
  const cover = { brideFirst: 'Maria', groomFirst: 'Juan', date: '2026-11-21' };
  const three = publishProblems('WEDDING', { cover, dressCode: { attire: 'formal', colors: ['#eddec3', '#cebdaf', '#daa8a6'] } });
  assert.ok(three.some((p) => /at least 4 colours/.test(p)), three.join(' | '));
  const four = publishProblems('WEDDING', { cover, dressCode: { attire: 'formal', colors: ['#eddec3', '#cebdaf', '#daa8a6', '#bccdb8'] } });
  assert.ok(!four.some((p) => /at least 4 colours/.test(p)), four.join(' | '));
  const none = publishProblems('WEDDING', { cover, dressCode: { attire: 'formal', gentsItems: ['suit'], colors: [] } });
  assert.ok(!none.some((p) => /colours/.test(p)), 'no motif at all is a choice, not a problem');
});

test('the presets are the sheet\'s trending families: eleven sets of four palette colours each', () => {
  assert.equal(PRESETS.length, 11);
  assert.equal(new Set(PRESETS.map((p) => p.key)).size, 11);
  assert.equal(new Set(PRESETS.map((p) => p.name)).size, 11);
  for (const p of PRESETS) {
    assert.equal(p.colours.length, 4, p.key);
    assert.equal(new Set(p.colours).size, 4, `${p.key} repeats a colour`);
    const hexes = presetColours(p);
    for (const h of hexes) assert.ok(swatchByHex(h), `${p.key}: ${h} is in the palette`);
  }
  assert.deepEqual(PRESETS.find((p) => p.key === 'jewel')?.colours, ['emerald', 'navy', 'burgundy', 'eggplant']);
});
