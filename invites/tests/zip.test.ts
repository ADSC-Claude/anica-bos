import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { zipStream, type ZipEntry } from '../src/lib/zip';
import { albumFilename } from '../src/lib/photos';

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      // In two pieces, because the writer checksums and counts across chunks
      // and a single-chunk test would never catch it getting that wrong.
      c.enqueue(bytes.slice(0, Math.ceil(bytes.length / 2)));
      c.enqueue(bytes.slice(Math.ceil(bytes.length / 2)));
      c.close();
    },
  });
}

async function zip(files: { name: string; body: Uint8Array }[]): Promise<Buffer> {
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (const f of files) yield { name: f.name, body: stream(f.body) };
  }
  const chunks: Uint8Array[] = [];
  const reader = zipStream(entries()).getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

const LOCAL = 0x04034b50;
const DESCRIPTOR = 0x08074b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

/** Every offset in the archive where this signature appears. */
function at(buf: Buffer, signature: number): number[] {
  const found: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i++) if (buf.readUInt32LE(i) === signature) found.push(i);
  return found;
}

test('an archive carries each file whole, and a checksum the platform agrees with', async () => {
  const one = Buffer.from('the first dance, out of focus, perfect');
  const two = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const buf = await zip([{ name: 'a.jpg', body: one }, { name: 'b.png', body: two }]);

  assert.equal(buf.readUInt32LE(0), LOCAL, 'starts with a local file header');
  assert.ok(buf.includes(one), 'the first file is in there byte for byte');
  assert.ok(buf.includes(two), 'and so is the second');

  // The checksums, against Node's own implementation rather than a number
  // copied from a previous run of this code — which would only prove it is
  // consistently wrong.
  const descriptors = at(buf, DESCRIPTOR);
  assert.equal(descriptors.length, 2, 'one descriptor per file');
  assert.equal(buf.readUInt32LE(descriptors[0] + 4), crc32(one));
  assert.equal(buf.readUInt32LE(descriptors[1] + 4), crc32(two));

  // and the sizes it promises are the sizes it wrote
  assert.equal(buf.readUInt32LE(descriptors[0] + 8), one.length);
  assert.equal(buf.readUInt32LE(descriptors[0] + 12), one.length);
  assert.equal(buf.readUInt32LE(descriptors[1] + 8), two.length);
});

test('the directory at the end names every file, and counts them', async () => {
  const buf = await zip([
    { name: 'a.jpg', body: Buffer.from('one') },
    { name: 'b.jpg', body: Buffer.from('two') },
    { name: 'c.jpg', body: Buffer.from('three') },
  ]);

  assert.equal(at(buf, CENTRAL).length, 3, 'three central headers');
  const eocd = at(buf, EOCD).at(-1)!;
  assert.equal(buf.readUInt16LE(eocd + 8), 3, 'and the end says three');
  assert.equal(buf.readUInt16LE(eocd + 10), 3);

  // The directory begins where the end record says it does. An unzipper reads
  // the archive backwards from here, so an offset that is out by one byte is
  // an archive nothing can open.
  const start = buf.readUInt32LE(eocd + 16);
  assert.equal(buf.readUInt32LE(start), CENTRAL, 'the offset points at the first central header');
  assert.equal(buf.readUInt32LE(eocd + 12), eocd - start, 'and the directory is as long as it claims');
});

test('an empty archive is still a valid one', async () => {
  // A couple whose photos have all been deleted gets a file that opens and is
  // empty, not one that says it is corrupt.
  const buf = await zip([]);
  assert.equal(at(buf, EOCD).length, 1);
  assert.equal(buf.readUInt16LE(at(buf, EOCD)[0] + 8), 0);
});

test('a name survives being a name', async () => {
  // Bit 11 of the flags says the name is UTF-8. Without it an unzipper is
  // entitled to read these bytes as code page 437 and make a mess of them.
  const buf = await zip([{ name: '001 Tita Baby ñ.jpg', body: Buffer.from('x') }]);
  assert.ok(buf.includes(Buffer.from('001 Tita Baby ñ.jpg', 'utf8')));
  assert.equal(buf.readUInt16LE(6) & 0x800, 0x800, 'the UTF-8 flag is set');
  assert.equal(buf.readUInt16LE(6) & 0x08, 0x08, 'and the sizes-follow-the-data flag');
});

test('a photo is named for when it arrived and who sent it', () => {
  const photo = { uploadedBy: 'Camille Ramos', contentType: 'image/jpeg', storagePath: 'guest/abc/xyz.jpg' };
  assert.equal(albumFilename(7, photo), '007 Camille Ramos.jpg');

  // Numbered so that sorting by name is the evening in order, three digits
  // deep because an album holds up to five hundred.
  assert.equal(albumFilename(1, photo).slice(0, 3), '001');
  assert.equal(albumFilename(500, photo).slice(0, 3), '500');
});

test('a guest cannot name a file into somewhere it should not go', () => {
  // The name is typed by whoever sent the photo. A slash in it is a file that
  // will not open, or — on an unzipper that trusts the archive — a file
  // written outside the folder the couple chose.
  const attack = { uploadedBy: '../../etc/passwd', contentType: 'image/jpeg', storagePath: 'guest/a/b.jpg' };
  const name = albumFilename(1, attack);
  assert.doesNotMatch(name, /[/\\]/);
  assert.doesNotMatch(name, /\.\./);
  assert.equal(name, '001 etcpasswd.jpg');

  // An extension is taken from the stored path, which this app wrote, and
  // never from anything a guest supplied.
  const odd = { uploadedBy: 'x', contentType: 'image/jpeg', storagePath: 'guest/a/b.jpg/../evil.sh' };
  assert.match(albumFilename(2, odd), /\.sh$/);
  assert.doesNotMatch(albumFilename(2, odd), /[/\\]/);

  // A name that is entirely punctuation still produces a file with a name.
  assert.equal(albumFilename(3, { ...attack, uploadedBy: '///' }), '003 a guest.jpg');
  assert.equal(albumFilename(4, { ...attack, uploadedBy: '' }), '004 a guest.jpg');
});
