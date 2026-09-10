/**
 * A repeatable section as a grid, and back.
 *
 * Some parts of an invitation are a list of the same thing over and over: the
 * principal sponsors, the programme, the FAQ, the moments in a story. They are
 * the parts people already keep in a spreadsheet, and the parts that are worst
 * to type into a browser — eighteen pairs of ninongs and ninangs is eighteen
 * pairs of boxes and a lot of scrolling.
 *
 * Every one of them is the same shape in src/lib/sections.ts: a `list` field
 * with an `item` of sub-fields. So this is written once against that shape
 * rather than per section, and every list in every occasion gets it — including
 * the ones added later.
 *
 * Reading is deliberately forgiving, because the file coming back has been
 * through somebody's hands. Headers are matched on their letters and digits
 * alone, so "Ninong", "ninong" and "Ninong / Ninang" all find the same column;
 * a file with no header row at all is read by position; a select takes either
 * the stored value or the label a person sees; and a row that is empty across
 * every column is dropped rather than added as a blank.
 */
import type { Field } from './sections';

/** Letters and digits only: what two spellings of a column name have in common. */
function key(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** What a cell should say for a value already stored. */
function cell(field: Field, value: unknown): string {
  if (value == null) return '';
  if (field.type === 'toggle') return value ? 'Yes' : 'No';
  const s = String(value);
  // A select is stored as its value; a person reads the label.
  if (field.type === 'select') return field.options?.find((o) => o.value === s)?.label ?? s;
  return s;
}

/** What to store for a cell somebody typed. */
function parse(field: Field, text: string): string | boolean {
  const s = (text ?? '').trim();
  if (field.type === 'toggle') return /^(y|yes|true|1|✓|x|oo|opo)$/i.test(s);
  if (field.type === 'select') {
    const byLabel = field.options?.find((o) => key(o.label) === key(s));
    const byValue = field.options?.find((o) => key(o.value) === key(s));
    return (byLabel ?? byValue)?.value ?? '';
  }
  return s;
}

/**
 * The rows as a grid: one header of the labels a person reads, then what is
 * already filled in. Downloading a list that is empty still gives the headers,
 * which is the blank to fill.
 */
export function listToGrid(item: Field[], rows: Record<string, unknown>[]): string[][] {
  const header = item.map((f) => f.label);
  const body = rows.map((r) => item.map((f) => cell(f, r[f.key])));
  return [header, ...body];
}

/**
 * A grid back into rows.
 *
 * `max` is the list's own limit — six secondary sponsors, eighteen roses — and
 * anything past it is dropped rather than silently kept and then refused on
 * save.
 */
export function gridToList(item: Field[], grid: string[][], max = 200): Record<string, string | boolean>[] {
  if (grid.length === 0) return [];

  const head = grid[0].map(key);
  // A column per field, by its label or its key. A file whose first row matches
  // nothing is a file with no header — read it from the top, by position.
  const at = item.map((f) => head.findIndex((h) => h && (h === key(f.label) || h === key(f.key))));
  const headed = at.some((i) => i >= 0);
  // A field the header does not mention keeps its -1 and comes back empty.
  const columns = headed ? at : item.map((_, n) => n);
  const body = headed ? grid.slice(1) : grid;

  const out: Record<string, string | boolean>[] = [];
  for (const row of body) {
    if (row.every((c) => !String(c ?? '').trim())) continue;
    const built: Record<string, string | boolean> = {};
    item.forEach((f, n) => {
      const c = columns[n];
      built[f.key] = parse(f, c >= 0 ? row[c] ?? '' : '');
    });
    // Every column blank once mapped means the row held nothing this list wants.
    if (item.every((f) => built[f.key] === '' || built[f.key] === false)) continue;
    out.push(built);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A filename a person can find again in their downloads: the list's own name,
 * without the parenthetical that helps on screen and only clutters here —
 * "Principal Sponsors (Ninong & Ninang)" becomes principal-sponsors.csv.
 */
export function sheetFilename(label: string): string {
  const part = label
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${part || 'list'}.csv`;
}
