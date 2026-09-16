/**
 * Reading an .xlsx, and only that.
 *
 * A guest list arrives as a spreadsheet because that is what a couple keeps it
 * in. They can save it as CSV — the importer has always read that — but the
 * step is easy to miss and the failure is silent-looking: they upload the
 * workbook they saved, nothing imports, and nothing tells them why. So the
 * workbook itself is read.
 *
 * No dependency for it. This app runs on nine runtime packages and the two
 * candidates are both large, and both do a hundred things beyond reading a
 * column of names. What is needed here is small and this is all of it: an
 * .xlsx is a ZIP of XML, Node inflates raw deflate already, and one sheet of
 * text cells is a couple of well-known files inside it.
 *
 * Read-only, first worksheet, cells as the text a person typed. Formulas are
 * read as their last cached result, which is what the file carries. Anything
 * beyond that — writing, styles, multiple sheets, dates as numbers — belongs to
 * the libraries, and if this app ever needs it, it should take one.
 */
import { inflateRawSync } from 'node:zlib';

/** One file pulled out of the archive. */
type Entry = { name: string; data: Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;

/**
 * The archive's own index, read from the end.
 *
 * A ZIP is read backwards: the End Of Central Directory record is last, and it
 * says where the directory of entries begins. The directory is trusted over the
 * local headers because only it is guaranteed to carry the sizes — a local
 * header may defer them to a descriptor after the data.
 */
function entries(buf: Buffer): Entry[] {
  let eocd = -1;
  // The record is 22 bytes plus a comment of up to 64k; scan back over that.
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip file');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Entry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // The local header repeats the name and may carry a different extra field,
    // so the data offset is computed from the local header rather than assumed.
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressed);

    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    // Anything else is a compression this reader does not claim to handle; the
    // entry is skipped rather than guessed at.

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Undo the five XML entities a spreadsheet writer produces. */
function unescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** The text of one element, with any runs inside it joined. */
function textOf(xml: string): string {
  const parts = [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1]));
  return parts.join('');
}

/** "BC7" → 54. The letters are base-26 with no zero. */
export function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0] ?? '';
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The first worksheet of an .xlsx, as rows of trimmed strings.
 *
 * Gaps are kept: a row that skips a column comes back with an empty string in
 * it, because the importer reads by position and a shifted row is worse than a
 * blank one. Trailing empty cells are trimmed off each row, and rows that are
 * entirely empty are dropped — a spreadsheet is usually saved with a few of
 * those under the last name.
 */
export function readXlsx(file: Buffer | Uint8Array): string[][] {
  const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
  const files = entries(buf);
  const find = (name: string) => files.find((f) => f.name === name)?.data.toString('utf8');

  const shared = find('xl/sharedStrings.xml');
  const strings = shared ? [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];

  // The workbook may name its sheets anything; the first one in document order
  // is the one a person filled in.
  const sheet =
    find('xl/worksheets/sheet1.xml') ??
    files.find((f) => /^xl\/worksheets\/.*\.xml$/.test(f.name))?.data.toString('utf8');
  if (!sheet) throw new Error('no worksheet in this file');

  const rows: string[][] = [];
  for (const [, rowXml] of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const [, attrs, body] of rowXml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = attrs.match(/r="([A-Z]+\d+)"/i)?.[1];
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      let value = '';
      if (type === 's') {
        const i = Number(body.match(/<v>(\d+)<\/v>/)?.[1] ?? -1);
        value = strings[i] ?? '';
      } else if (type === 'inlineStr') {
        value = textOf(body);
      } else {
        value = unescape(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      }
      const at = ref ? columnIndex(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = value.trim();
    }
    while (row.length && row[row.length - 1] === '') row.pop();
    if (row.length) rows.push(row);
  }
  return rows;
}

/** Whether a file looks like a ZIP, and so like a workbook rather than text. */
export function looksLikeXlsx(file: Buffer | Uint8Array): boolean {
  const b = Buffer.isBuffer(file) ? file : Buffer.from(file);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
}
