/**
 * Writing a ZIP, and only as much of one as a folder of photographs needs.
 *
 * No dependency, for the reason the .xlsx reader next door gives: the
 * candidates are large and do a hundred things beyond this. What is needed
 * here is an album of JPEGs in one file, and that is the simplest archive
 * there is — stored, not compressed. A JPEG is already compressed; deflating
 * it again spends a couple of seconds of CPU per megabyte to save nothing, and
 * would mean holding each photo in memory to compress it.
 *
 * Stored entries make it streamable, which is the point. A wedding album is
 * five hundred photographs and gigabytes; nothing here ever holds more than one
 * of them, and the browser starts saving before the server has read the last.
 *
 * What it deliberately does not do: compression, encryption, directories,
 * timestamps beyond a fixed one, or files above 4 GB. The last is worth naming
 * — the sizes in an entry's header are 32-bit, so a single file must be under
 * 4 GB. Uploads are capped at 10 MB, so nothing near it can exist. The archive
 * as a whole may be any size: the offsets that would overflow are written in
 * their ZIP64 form when they need to be.
 */

/** A file to put in the archive. The body is read once, in order. */
export type ZipEntry = {
  name: string;
  body: ReadableStream<Uint8Array>;
};

const LOCAL = 0x04034b50;
const DESCRIPTOR = 0x08074b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;

/** The value a 32-bit field carries when the real one is in a ZIP64 extra. */
const NEEDS64 = 0xffffffff;

/**
 * Bit 3 says the sizes and checksum follow the data instead of preceding it,
 * which is what makes a stored entry writable without reading the file first.
 * Bit 11 says the name is UTF-8, so "Tita Baby's photo" survives.
 */
const FLAGS = 0x08 | 0x800;

/** Stored. See the note above on why nothing here is deflated. */
const STORE = 0;

/**
 * One fixed timestamp rather than each photo's own.
 *
 * A ZIP carries MS-DOS date and time in local time with no zone, so "when the
 * guest sent it" cannot be written faithfully anyway — the couple, their guest
 * and the server may be in three different places. A constant is at least
 * honestly meaningless, and every file in the archive sorts the same way.
 */
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1 January 1980, the earliest a ZIP can express.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A little-endian writer, because every number in a ZIP is one. */
class Bytes {
  private parts: Uint8Array[] = [];
  private size = 0;

  u16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return this.push(b); }
  u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return this.push(b); }
  u64(n: number) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return this.push(b); }
  raw(b: Uint8Array) { return this.push(b); }

  private push(b: Uint8Array) {
    this.parts.push(b);
    this.size += b.length;
    return this;
  }

  done(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

type Written = { name: Uint8Array; crc: number; size: number; offset: number };

function localHeader(name: Uint8Array): Uint8Array {
  return new Bytes()
    .u32(LOCAL).u16(20).u16(FLAGS).u16(STORE).u16(DOS_TIME).u16(DOS_DATE)
    // Checksum and both sizes are zero here and real in the descriptor below.
    .u32(0).u32(0).u32(0)
    .u16(name.length).u16(0)
    .raw(name)
    .done();
}

function descriptor(crc: number, size: number): Uint8Array {
  return new Bytes().u32(DESCRIPTOR).u32(crc).u32(size).u32(size).done();
}

function centralHeader(e: Written): Uint8Array {
  // The only field that can overflow on an album is the offset, once the
  // archive passes 4 GB. Sizes cannot: an upload is capped well below it.
  const big = e.offset > NEEDS64;
  const extra = big ? new Bytes().u16(0x0001).u16(8).u64(e.offset).done() : new Uint8Array(0);
  return new Bytes()
    .u32(CENTRAL).u16(big ? 45 : 20).u16(big ? 45 : 20).u16(FLAGS).u16(STORE)
    .u16(DOS_TIME).u16(DOS_DATE)
    .u32(e.crc).u32(e.size).u32(e.size)
    .u16(e.name.length).u16(extra.length).u16(0)
    .u16(0).u16(0).u32(0)
    .u32(big ? NEEDS64 : e.offset)
    .raw(e.name).raw(extra)
    .done();
}

function end(written: Written[], start: number, length: number): Uint8Array {
  const big = written.length > 0xffff || start > NEEDS64 || length > NEEDS64;
  const out = new Bytes();
  if (big) {
    // The ZIP64 record carries the true numbers; the ordinary one below keeps
    // its overflow markers so a reader that knows nothing of ZIP64 still finds
    // a well-formed end to the file.
    out.u32(EOCD64).u64(44).u16(45).u16(45).u32(0).u32(0)
      .u64(written.length).u64(written.length).u64(length).u64(start);
    out.u32(LOCATOR64).u32(0).u64(start + length).u32(1);
  }
  out.u32(EOCD).u16(0).u16(0)
    .u16(big ? 0xffff : written.length).u16(big ? 0xffff : written.length)
    .u32(big ? NEEDS64 : length).u32(big ? NEEDS64 : start)
    .u16(0);
  return out.done();
}

/**
 * The archive, as a stream.
 *
 * `entries` is read lazily and one at a time on purpose: the caller hands over
 * a list of five hundred photographs and this opens each only when it is that
 * photograph's turn, so the memory in play is one file's buffer no matter how
 * large the album is.
 */
export function zipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const written: Written[] = [];
  let at = 0;
  let iterator: AsyncIterator<ZipEntry> | null = null;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      iterator ??= entries[Symbol.asyncIterator]();
      const next = await iterator.next();

      if (next.done) {
        const start = at;
        const central = new Bytes();
        for (const e of written) central.raw(centralHeader(e));
        const directory = central.done();
        controller.enqueue(directory);
        controller.enqueue(end(written, start, directory.length));
        controller.close();
        return;
      }

      const name = new TextEncoder().encode(next.value.name);
      const offset = at;
      const header = localHeader(name);
      controller.enqueue(header);
      at += header.length;

      let crc = 0;
      let size = 0;
      const reader = next.value.body.getReader();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        crc = crc32(crc, chunk.value);
        size += chunk.value.length;
        controller.enqueue(chunk.value);
      }
      at += size;

      const tail = descriptor(crc, size);
      controller.enqueue(tail);
      at += tail.length;

      written.push({ name, crc, size, offset });
    },
  });
}
