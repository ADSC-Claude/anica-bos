import test from 'node:test';
import assert from 'node:assert/strict';
import { fontFile, fontType, whyNotAFace, FONT_MAX_BYTES, FONT_TYPES } from '../src/lib/fontfile';

const bytes = (...parts: (number | string | Uint8Array)[]): Uint8Array => {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === 'number') flat.push(p);
    else if (typeof p === 'string') for (const c of p) flat.push(c.charCodeAt(0));
    else flat.push(...p);
  }
  return new Uint8Array(flat);
};
const pad = (head: Uint8Array) => bytes(head, new Uint8Array(16));

test('each of the four says what it is in its first four bytes', () => {
  assert.equal(fontFile(pad(bytes('wOF2'))), 'woff2');
  assert.equal(fontFile(pad(bytes('wOFF'))), 'woff');
  assert.equal(fontFile(pad(bytes('OTTO'))), 'otf');
  // TrueType: a version of 1.0 as a fixed-point number
  assert.equal(fontFile(pad(bytes(0x00, 0x01, 0x00, 0x00))), 'ttf');
  // and Apple's older spelling of the same thing
  assert.equal(fontFile(pad(bytes('true'))), 'ttf');
  assert.deepEqual(FONT_TYPES.map((t) => t.split('/')[0]), ['font', 'font', 'font', 'font']);
  assert.equal(fontType(pad(bytes('wOF2'))), 'font/woff2');
});

test('a near miss is told what to do about it, not just refused', () => {
  // a collection holds several faces and a browser will load none of them
  assert.equal(fontFile(pad(bytes('ttcf'))), null);
  assert.match(whyNotAFace(pad(bytes('ttcf'))), /collection/);
  // what every foundry actually delivers
  assert.equal(fontFile(pad(bytes(0x50, 0x4b, 0x03, 0x04))), null);
  assert.match(whyNotAFace(pad(bytes(0x50, 0x4b, 0x03, 0x04))), /zip/);
  assert.match(whyNotAFace(pad(bytes('%PDF-1.7'))), /PDF/);
  // and anything else names the four
  assert.match(whyNotAFace(pad(bytes('RIFF'))), /\.woff2, \.woff, \.ttf or \.otf/);
  assert.match(whyNotAFace(bytes('wOF')), /too short/);
});

test('a still picture, a clip and a Lottie are not faces', () => {
  assert.equal(fontFile(pad(bytes(0xff, 0xd8, 0xff, 0xe0))), null, 'a JPEG');
  assert.equal(fontFile(pad(bytes(0x89, 'PNG'))), null, 'a PNG');
  assert.equal(fontFile(pad(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))), null, 'a WebP');
  assert.equal(fontFile(pad(bytes('{"v":"5.'))), null, 'a Lottie');
});

test('the cap is stricter than a picture’s, and for a different reason', () => {
  // every guest downloads a face whole before the words can be read
  assert.equal(FONT_MAX_BYTES, 1024 * 1024);
});
