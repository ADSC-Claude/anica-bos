import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, SWATCHES, MOTIF_MIN, MOTIF_MAX, swatchByHex, swatchName, swatchStyle } from '../src/lib/palette';
import { publishProblems, fieldsFor } from '../src/lib/sections';

test('the palette is the designer\'s sheet: eleven families, ninety-one named colours, no two alike', () => {
  assert.equal(PALETTE.length, 11);
  assert.equal(SWATCHES.length, 91);
  assert.equal(new Set(SWATCHES.map((s) => s.key)).size, 91, 'keys unique');
  assert.equal(new Set(SWATCHES.map((s) => s.hex)).size, 91, 'colours unique');
  for (const s of SWATCHES) {
    assert.match(s.hex, /^#[0-9a-f]{6}$/, s.key);
    assert.ok(s.name.trim().length > 0, s.key);
  }
  assert.equal(PALETTE.find((g) => g.key === 'metallics')?.swatches.every((s) => s.metallic), true);
});

test('a stored hex finds its name whatever its case; a colour outside the palette has none', () => {
  assert.equal(swatchName('#DAA8A6'), 'Dusty Rose');
  assert.equal(swatchByHex('#bccdb8')?.name, 'Sage');
  assert.equal(swatchName('#123456'), '');
  assert.equal(swatchStyle('#bccdb8'), '#bccdb8');
  assert.match(swatchStyle('#dfbb74', true), /^linear-gradient/);
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
