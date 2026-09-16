import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { builtinPieces, matchPiece, searchPieces, shownPieces, groupOf, pieceOf, type Piece } from '../src/lib/library';

/**
 * The library is derived from the constants that already name the app's
 * artwork, so the one thing that can go wrong is a file moving and the
 * library going on pointing at where it was. That is the first test.
 */

const all = builtinPieces();

test('every built-in piece is a file that is actually there', () => {
  assert.ok(all.length > 100, `only ${all.length} pieces`);
  const missing = all.filter((p) => !existsSync(`public${p.url}`)).map((p) => p.url);
  assert.deepEqual(missing, []);
});

test('the three built-in groups are all there, and a background knows its own shape', () => {
  const by = (g: string) => all.filter((p) => groupOf(p) === g);
  assert.equal(by('backgrounds').length, 18);     // ten Baby Blue pages and eight Capiz
  assert.equal(by('pieces').length, 1);           // the Capiz strand
  assert.equal(by('wardrobe').length, 109);
  assert.equal(by('mine').length, 0);

  const cover = all.find((p) => p.url === '/babyblue/cover.webp')!;
  // the same numbers the renderer has always drawn the cover with, and the
  // three cuts it shipped with, so a flow page taking it needs no cutting
  assert.deepEqual(cover.ground, {
    ratio: 2.989, top: '#b4c3d5', bottom: '#d5cbc5',
    slices: { top: '/babyblue/cover-top.webp', foot: '/babyblue/cover-foot.webp', mid: '/babyblue/cover-mid.webp' },
  });
  // the two drawn pages are exactly their ground's height and shipped no cuts
  assert.equal(all.find((p) => p.url === '/babyblue/story.webp')!.ground!.slices, undefined);
});

test('a search matches whole words from the start, in the name or a tag', () => {
  const strand: Piece = { url: '/capiz/strand-b.webp', name: 'Capiz strand', tags: ['capiz', 'piece', 'flowers'], builtin: true };
  assert.equal(matchPiece(strand, ''), true);
  assert.equal(matchPiece(strand, 'cap'), true);
  assert.equal(matchPiece(strand, 'CAPIZ'), true);
  assert.equal(matchPiece(strand, 'flow'), true);
  assert.equal(matchPiece(strand, 'capiz flowers'), true);   // every word has to land
  assert.equal(matchPiece(strand, 'capiz bow'), false);
  assert.equal(matchPiece(strand, 'trand'), false);          // the middle of a word is not a search
  // punctuation on either side is not part of a word
  assert.equal(matchPiece({ ...strand, name: 'Baby Blue — cover' }, 'baby blue'), true);
});

test('a search reaches the wardrobe; browsing does not wade through it', () => {
  assert.equal(shownPieces(all, '', 'all').some((p) => groupOf(p) === 'wardrobe'), false);
  assert.equal(shownPieces(all, '', 'all').length, 19);
  assert.ok(shownPieces(all, 'barong', 'all').length >= 3);
  // asked for by name, the whole wardrobe is there
  assert.equal(shownPieces(all, '', 'wardrobe').length, 109);
  // and a group narrows without hiding what the search found
  assert.equal(shownPieces(all, 'capiz', 'backgrounds').length, 8);
});

test('a piece she uploaded keeps its row, and an unnamed one is still findable', () => {
  const mine = pieceOf({ id: 'm1', url: '/uploads/library/a.webp', name: 'Gold bow', tags: ['bow', 'gold'], width: 400, height: 200 });
  assert.equal(mine.builtin, undefined);
  assert.equal(mine.id, 'm1');
  assert.equal(groupOf(mine), 'mine');
  assert.equal(searchPieces([mine], 'gold').length, 1);
  const blank = pieceOf({ id: 'm2', url: '/uploads/library/b.webp', name: '', tags: [], width: null, height: null });
  assert.equal(blank.name, 'Untitled');
  assert.equal(blank.width, undefined);
});
