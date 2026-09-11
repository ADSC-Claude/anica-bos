import test from 'node:test';
import assert from 'node:assert/strict';
import { openPdf, readPdfPages, faceFor, PDF_TROUBLE } from '../src/lib/pdf-import';
import type { Fonts } from '../src/lib/theme';
import { makePdf } from './fixtures/pdf';

/**
 * The PDF reader, against pages whose rectangles are known because they
 * were written into the file three lines above the assertion.
 */

const read = async (bytes: Uint8Array) => {
  const { doc, close } = await openPdf(bytes);
  try { return await readPdfPages(doc); } finally { await close(); }
};

// a 600 x 900 page: 1% is 6 points across and 9 points down
const SHEET = makePdf({
  width: 600, height: 900,
  images: [
    { x: 48, y: 648, w: 228, h: 198 },     // 8% 6% 38% 22%, measured from the top
    { x: 324, y: 648, w: 228, h: 198 },    // 54% 6% 38% 22%
    { x: 48, y: 306, w: 504, h: 288 },     // 8% 34% 84% 32%
  ],
  text: [{ x: 60, y: 300, size: 24, words: 'Lucas Andrei' }],
});

test('the pictures placed in a PDF come back as frames where they were placed', async () => {
  const [page] = await read(SHEET);
  assert.equal(page.n, 1);
  assert.equal(page.ratio, 1.5);
  assert.equal(page.trouble, undefined);
  assert.deepEqual(page.frames, [
    { left: 8, top: 6, width: 38, height: 22 },
    { left: 54, top: 6, width: 38, height: 22 },
    { left: 8, top: 34, width: 84, height: 32 },
  ]);
});

test('the words come back as a box, where they are and the size they are', async () => {
  const [page] = await read(SHEET);
  assert.equal(page.texts.length, 1);
  const box = page.texts[0];
  assert.deepEqual(box.lines, ['Lucas Andrei']);
  assert.equal(box.left, 10);                    // 60 of 600
  assert.equal(box.size, 4);                     // 24 points of a 600-point width, in cqw
  // the baseline is at 300 from the foot, so the top of the box is a little above it
  assert.ok(box.top > 64 && box.top < 67, `top was ${box.top}`);
  assert.ok(box.width > 20 && box.width < 26, `width was ${box.width}`);
  // Helvetica is nobody's design face, so the box comes in unset rather than guessed
  assert.equal(box.face, undefined);
});

test('several runs on one line are one line, and stacked lines one box', async () => {
  const [page] = await read(makePdf({
    width: 600, height: 900,
    text: [
      { x: 60, y: 800, size: 20, words: 'Please join' },
      { x: 180, y: 800, size: 20, words: 'us' },       // same baseline: one line
      { x: 60, y: 774, size: 20, words: 'at the christening' },   // under it: same box
      { x: 60, y: 400, size: 20, words: 'Far below' },            // its own box
    ],
  }));
  assert.deepEqual(page.texts.map((t) => t.lines), [['Please join us', 'at the christening'], ['Far below']]);
});

test('a flattened page is refused, and the two-picture way is named', async () => {
  const [page] = await read(makePdf({ width: 600, height: 900, images: [{ x: 0, y: 0, w: 600, h: 900 }], text: [] }));
  assert.equal(page.trouble, 'flattened');
  // the page's one picture is the page, so it is not offered as a frame
  assert.deepEqual(page.frames, []);
  assert.match(PDF_TROUBLE.flattened, /two-picture way/);
});

test('outlined words are reported as outlines rather than read as nothing', async () => {
  const [page] = await read(makePdf({ width: 600, height: 900, paths: 60 }));
  assert.equal(page.trouble, 'outlined');
  assert.deepEqual(page.texts, []);
  assert.match(PDF_TROUBLE.outlined, /cannot be reworded/);
});

test('a full-page picture with words over it is a background, not a flattened page', async () => {
  const [page] = await read(makePdf({
    width: 600, height: 900,
    images: [{ x: 0, y: 0, w: 600, h: 900 }],
    text: [{ x: 60, y: 300, size: 24, words: 'Still words' }],
  }));
  assert.equal(page.trouble, undefined);
  assert.equal(page.frames.length, 1);
});

test('a face is matched to the design\'s own by its name, however the PDF spells it', () => {
  const fonts: Fonts = {
    display: "'Playfair Display', 'Hoefler Text', Georgia, serif",
    body: "'Lora', Georgia, serif",
    names: "'Great Vibes', 'Brush Script MT', cursive",
    script: "'Great Vibes', 'Brush Script MT', cursive",
    load: ['Playfair Display', 'Lora', 'Great Vibes'],
  };
  assert.equal(faceFor('PlayfairDisplay-Bold', fonts), 'display');
  assert.equal(faceFor('ABCDEF+PlayfairDisplay', fonts), 'display');
  assert.equal(faceFor('Lora', fonts), 'body');
  assert.equal(faceFor('GreatVibes-Regular', fonts), 'names');
  // a face Canva licenses and this design does not carry stays unset
  assert.equal(faceFor('TANMonCheri', fonts), undefined);
  assert.equal(faceFor('', fonts), undefined);
  assert.equal(faceFor('Lora', undefined), undefined);
});

test('the page can be drawn without what is being lifted off it', async () => {
  const [page] = await read(SHEET);
  // three pictures and one run of words: four operations the ground leaves out
  assert.equal(page.skip.length, 4);
  assert.deepEqual([...page.skip].sort((a, b) => a - b), page.skip);
  // a page that cannot be read is not drawn at all, so nothing is skipped
  const [flat] = await read(makePdf({ width: 600, height: 900, images: [{ x: 0, y: 0, w: 600, h: 900 }] }));
  assert.deepEqual(flat.skip, []);
});
