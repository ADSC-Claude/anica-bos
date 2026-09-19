/**
 * A godparent's name is one line.
 *
 * "make the God Parents name only in one line, its occupying the whole space.
 * atleast make the font smaller I guess"
 *
 * Her column held 8.65 em. Her own longest ninang — Maria Victoria German-Tan
 * — measures 11.14 em in Abhaya Libre, the christening's body face, so two
 * names in three folded onto a second line: ten ninongs came out as fifteen
 * lines, and a page that grows to hold its list grew to the bottom of the
 * paper.
 *
 * Two things were wrong and only one of them was the size. The box was 30% of
 * the page and fourteen per cent of plain paper sat unused between the two
 * columns; since the names are centred, a wider box moves nothing on the page
 * — it only stops the fold. So the box is 38% and the type came down from
 * pt(28.10) to pt(23).
 *
 * The widest sort of name costs 0.4684 em a character, measured in the real
 * face over the shapes that are widest: Ma./Maria prefixes, two given names,
 * hyphenated married surnames. Twenty-eight of those is 13.12 em, and 38% at
 * pt(23) holds 13.38 — so the form accepts twenty-eight characters and the
 * page prints all of them on one line. Nothing in the live database is over
 * twenty-two.
 *
 * Measured in a browser afterwards: ten names, ten lines, 157px where the old
 * pair was 289.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT } from '../src/lib/sections';
import { CHRISTENING_PAGES } from '../src/lib/christening';
import type { TextEl } from '../src/lib/design';

/** the widest em a character of a name costs, measured in Abhaya Libre */
const EM_PER_CHARACTER = 0.4684;
const PT = 8.1;

const page = CHRISTENING_PAGES.find((p) => p.key === 'godparents')!;
const box = (id: string) => (page.elements ?? []).find((e) => e.id === id) as TextEl;

test('both columns hold every name the form accepts, on one line', () => {
  const cap = FIT['sponsors.ninongs.name'];
  assert.equal(cap, 28, 'one line of the column');
  assert.equal(FIT['sponsors.ninangs.name'], cap, 'and the ninangs are given the same room');
  const needs = EM_PER_CHARACTER * cap;
  for (const id of ['gp-ninongs', 'gp-ninangs']) {
    const el = box(id);
    const size = el.size ?? 0;
    assert.ok(size > 0, `${id} has a size`);
    const holds = el.w! / size;
    assert.ok(holds >= needs, `${id} holds ${holds.toFixed(2)} em, needs ${needs.toFixed(2)} for ${cap} characters`);
  }
});

test('the names came down in size and the columns went wider', () => {
  for (const id of ['gp-ninongs', 'gp-ninangs']) {
    const el = box(id);
    assert.equal(el.size, Math.round((23 / PT) * 100) / 100, `${id}: pt(23), down from pt(28.10)`);
    assert.equal(el.w, 38, `${id}: 38% of the page, up from 30`);
    assert.equal(el.leading, 1.32, `${id}: still her leading`);
  }
});

test('the two columns do not reach into one another at the longest name', () => {
  // the names are centred, so what can collide is the ink either side of
  // each column's centre — half the longest name, at the cap
  const size = box('gp-ninongs').size ?? 0;
  const half = (EM_PER_CHARACTER * FIT['sponsors.ninongs.name'] * size) / 2;
  const right = box('gp-ninongs').x! + half;
  const left = box('gp-ninangs').x! - half;
  assert.ok(left > right, `a gap of ${(left - right).toFixed(2)}% of the page between the longest two names`);
});
