import { place, type FieldRef, type PhotoEl } from './design';

/**
 * Bringing a page in from wherever it was designed.
 *
 * Canva hands another system nothing about a design — no elements, no
 * positions, no idea which rectangle is a photo frame — so the way in is a
 * file the owner exports by hand. The hard part is then finding the photo
 * frames in a picture, and there is a trick for it that costs nothing and
 * needs no library:
 *
 *   Export the page twice. Once as designed, with the placeholder
 *   photographs sitting in their frames, and once with those photographs
 *   deleted. The version *without* them is the background; the difference
 *   between the two is exactly where the photographs belong.
 *
 * So this subtracts one from the other and returns the rectangles that
 * changed, in the same whole percents the document already places elements
 * in. Nothing here touches a browser API: it takes two flat arrays of
 * pixels, which is what a canvas hands over and what a test can make up, so
 * the arithmetic is provable without a screen.
 *
 * The picture *without* the placeholders is the one kept as the ground,
 * which is why the frames end up sitting on empty artwork rather than on a
 * printed photograph of somebody else's baby.
 */

/** What a canvas's `getImageData` hands over: RGBA, four bytes a pixel, row by row. */
export type Pixels = { data: ArrayLike<number>; width: number; height: number };

/** A proposed frame, in whole percents: left and width of the page's width, top and height of its height. */
export type Rect = { left: number; top: number; width: number; height: number };

/**
 * A pixel counts as changed when one of its channels differs by more than
 * this, out of 255. Twelve clears JPEG's ringing and the faint edge
 * softening an export adds, and is far under the difference between a
 * photograph and the empty frame it sat in.
 */
export const CHANGED = 12;
/**
 * The mask is a quarter of the picture in each direction, so a sixteenth of
 * the work. A frame is never smaller than a few dozen cells at that size,
 * and single stray pixels cannot make a cell.
 */
export const CELL = 4;
/** A group covering less than this share of the page is noise, not a frame. */
export const NOISE = 0.015;
/** Two boxes overlapping by more than this share of the smaller are one frame. */
export const MERGE = 0.75;

export type DiffOptions = { threshold?: number; cell?: number; floor?: number; merge?: number };

/**
 * The frames, read from the difference between the two exports.
 *
 * `plain` is the page with the placeholders deleted and `filled` the page as
 * designed. Both must already be the same size — the studio draws them into
 * canvases of one width before calling — because two pictures of different
 * shapes cannot be subtracted and guessing which one to stretch is how a
 * frame ends up a percent off everywhere.
 */
export function framesFromDifference(plain: Pixels, filled: Pixels, opts: DiffOptions = {}): Rect[] {
  const { threshold = CHANGED, cell = CELL, floor = NOISE, merge = MERGE } = opts;
  if (plain.width !== filled.width || plain.height !== filled.height) {
    throw new Error('The two pictures are different sizes. Export both at the same size, with only the photographs removed from one.');
  }
  const { width, height } = plain;
  if (width < cell || height < cell) throw new Error('Those pictures are too small to read.');

  // Which pixels changed, and how much of each cell did. A cell is a block
  // of `cell` x `cell` pixels; the ones along the right and bottom edges are
  // short, so each keeps its own count of how many pixels it actually holds.
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const hit = new Int32Array(cols * rows);
  const held = new Int32Array(cols * rows);
  const changed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = ((y / cell) | 0) * cols;
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const i = at * 4;
      const c = row + ((x / cell) | 0);
      held[c]++;
      const d = Math.max(
        Math.abs(plain.data[i] - filled.data[i]),
        Math.abs(plain.data[i + 1] - filled.data[i + 1]),
        Math.abs(plain.data[i + 2] - filled.data[i + 2]),
      );
      if (d > threshold) { changed[at] = 1; hit[c]++; }
    }
  }
  // A quarter of a cell is enough to call it changed: the inside of a
  // photograph changes wholesale, while compression noise lands on one pixel
  // here and one there and never fills a corner of a cell.
  const mask = new Uint8Array(cols * rows);
  for (let c = 0; c < mask.length; c++) mask[c] = hit[c] * 4 >= held[c] ? 1 : 0;

  const rects: Rect[] = [];
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    // One group, by a flood fill with its own stack — a picture this size
    // would blow a recursive one over. Cells touching at a corner count as
    // joined, so a frame split by a one-cell seam is still one frame.
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let x0 = cols, x1 = -1, y0 = rows, y1 = -1, area = 0;
    while (stack.length) {
      const c = stack.pop() as number;
      const cx = c % cols, cy = (c / cols) | 0;
      area++;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= cols) continue;
          const n = ny * cols + nx;
          if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    if (area / (cols * rows) < floor) continue;
    // The group was found on the coarse mask, so its box is a cell too big
    // on every side. Tightening it against the pixels themselves inside
    // that box costs one more pass over the frame and puts the edge where
    // the photograph's edge actually is, rather than within four pixels of
    // it. It can only ever shrink the box, never reach past it.
    rects.push(snapRect(tighten(changed, width, height, x0 * cell, y0 * cell, Math.min(width, (x1 + 1) * cell), Math.min(height, (y1 + 1) * cell))));
  }
  return mergeBoxes(rects, merge).sort((a, b) => a.top - b.top || a.left - b.left);
}

type Edges = { left: number; top: number; right: number; bottom: number };

/** The tightest box around the changed pixels inside a box already found. */
function tighten(changed: Uint8Array, width: number, height: number, px0: number, py0: number, px1: number, py1: number): Edges {
  let left = px1, top = py1, right = px0, bottom = py0;
  for (let y = py0; y < py1; y++) {
    const row = y * width;
    for (let x = px0; x < px1; x++) {
      if (!changed[row + x]) continue;
      if (x < left) left = x;
      if (x >= right) right = x + 1;
      if (y < top) top = y;
      if (y >= bottom) bottom = y + 1;
    }
  }
  // a group always holds at least one changed pixel, so these always moved
  return { left: left / width, top: top / height, right: right / width, bottom: bottom / height };
}

/** A box in fractions of the page, snapped to the whole percents elements are placed in. */
export function snapRect({ left, top, right, bottom }: Edges): Rect {
  const l = Math.round(left * 100), t = Math.round(top * 100);
  return {
    left: l, top: t,
    width: Math.max(1, Math.round(right * 100) - l),
    height: Math.max(1, Math.round(bottom * 100) - t),
  };
}

const area = (r: Rect) => r.width * r.height;

/** How much of the smaller of two boxes the other one covers. */
export function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(area(a), area(b));
}

/**
 * Boxes that are mostly the same box become one.
 *
 * A photograph with a caption printed into it, or one whose frame has a
 * border the export softened, can come back as a big rectangle and a sliver
 * lying inside it. One frame is the right answer, and it is the union: the
 * owner can always drag it in, and cannot invent the part that was dropped.
 */
export function mergeBoxes(rects: Rect[], threshold = MERGE): Rect[] {
  const out = rects.slice();
  for (let again = true; again; ) {
    again = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (overlap(out[i], out[j]) <= threshold) continue;
        const a = out[i], b = out[j];
        const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
        out[i] = {
          left, top,
          width: Math.max(a.left + a.width, b.left + b.width) - left,
          height: Math.max(a.top + a.height, b.top + b.height) - top,
        };
        out.splice(j, 1);
        again = true;
        break outer;
      }
    }
  }
  return out;
}

/**
 * A proposed rectangle as the element it will become.
 *
 * `ratio` is the page's own height over its width, because a frame's aspect
 * is measured in pixels while its place is measured in percents of two
 * different edges. It comes in marked Ask the customer: a frame the studio
 * found is by definition an empty one waiting for somebody's photograph.
 */
export function photoFromRect(id: string, rect: Rect, ratio: number, bind: FieldRef | { asset: string }): PhotoEl {
  return {
    id, kind: 'photo', bind, ask: true, anchor: 'centre',
    x: place(rect.left + rect.width / 2),
    y: place(rect.top + rect.height / 2),
    w: place(rect.width),
    aspect: place((rect.height / rect.width) * ratio),
  };
}

// ---------------------------------------------------------------------------
// What a placeholder is for
// ---------------------------------------------------------------------------

/**
 * Reading a master's placeholder and saying what question fills it.
 *
 * A page designed elsewhere and brought in carries its words as
 * *placeholders* — "AMELIA & MATTHEW", "DECEMBER 18, 2026", "San Agustin
 * Church" — which are the designer's stand-ins for a customer's answers.
 * Brought in as they are, they come in as those literal words: a design
 * that says Amelia and Matthew are getting married no matter whose
 * invitation it is. So each one has to be wired to the question that fills
 * it, and a cover alone carries five or six.
 *
 * Doing that by hand, forty boxes a design, is the difference between a
 * design imported in five minutes and one imported in an hour. So the
 * placeholder is *read*: its own words say what it is, near enough to offer
 * her an answer to confirm rather than a list to hunt through.
 *
 * Two deliberate limits:
 *
 *   • **It reads the words, not the design.** "DECEMBER 18, 2026" is a date
 *     wherever it sits; a long paragraph is a message wherever it sits. No
 *     rule here looks at where on the page a thing is, because a master's
 *     layout is hers and the next one will be laid out differently.
 *   • **It answers or it says nothing.** A guess it cannot make is left for
 *     her, marked as hers to fill. A wrong guess she has to notice and undo
 *     is worse than no guess at all, so every rule below is one that reads
 *     the words themselves rather than one that hopes.
 */

/**
 * The kinds of thing a placeholder turns out to be.
 *
 * `namePair` is separate from `name` and gets no automatic wiring, which is
 * deliberate and is the one case worth spelling out. "AMELIA & MATTHEW" is
 * the commonest placeholder on any cover, and there is no single question
 * that fills it: the form asks for the bride and the groom separately,
 * because two customers' names are two different lengths and a design has
 * to be able to set them apart. Wiring the pair to either one of them would
 * put one name where the master had two — a design quietly wrong on every
 * invitation after it, and wrong in the way nobody checks. So it is read,
 * named, and handed to her.
 *
 * `heading` is the design's own word rather than the customer's: "OUR
 * STORY" over a page is the same words for everybody, and belongs to the
 * design's heading for that part.
 */
export type PlaceholderKind =
  | 'name' | 'fullName' | 'namePair' | 'heading' | 'date' | 'time' | 'venue' | 'address' | 'hashtag' | 'phone' | 'monogram' | 'message';

/** Two headings said the same way: letters and numbers only, case and punctuation put aside. */
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A month, in the ways a designer writes one. */
const MONTHS = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
/** The words that name a place rather than describe one. */
const PLACES = /\b(church|parish|cathedral|chapel|shrine|basilica|hotel|pavilion|ballroom|restaurant|garden|gardens|hall|resort|club|venue|events?\s+place|farm|villa|tagaytay)\b/i;
/** The words that mean this is an address and not a name. */
const STREETS = /\b(st\.?|street|ave\.?|avenue|road|rd\.?|blvd\.?|boulevard|highway|barangay|brgy\.?|city|province|cor\.?|corner|km\.?|floor|bldg\.?|building)\b/i;

/**
 * What this placeholder looks like it is for, and why.
 *
 * The `why` is not decoration: it is shown beside the guess so she can see
 * at a glance whether the reading was sound, which is the whole of how a
 * guess earns being trusted.
 */
export function readPlaceholder(lines: string[], headings: string[] = []): { kind: PlaceholderKind; why: string } | undefined {
  const all = lines.join(' ').trim();
  if (!all) return undefined;
  const one = all.replace(/\s+/g, ' ');
  const words = one.split(' ').filter(Boolean);

  // A heading the design owns, matched against the headings it can name.
  for (const h of headings) if (bare(h) && bare(h) === bare(one)) return { kind: 'heading', why: 'it is a heading, the same words for every guest' };

  // A hashtag is the one placeholder that announces itself.
  if (/^#[\wÀ-ɏ]+$/.test(one)) return { kind: 'hashtag', why: 'it begins with a hash' };

  // A time: four o'clock in the ways a designer writes it.
  if (/^\d{1,2}([:.]\d{2})?\s*(am|pm|a\.m\.|p\.m\.|nn|noon)$/i.test(one)) return { kind: 'time', why: 'it reads as a time of day' };
  if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(one)) return { kind: 'time', why: 'it reads as a time of day' };

  // A date: a month named, or all numbers in a date's shape.
  if (new RegExp(`\\b${MONTHS}\\b`, 'i').test(one) && /\d/.test(one)) return { kind: 'date', why: 'it names a month and a number' };
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(one)) return { kind: 'date', why: 'it reads as a date' };
  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(one)) return { kind: 'date', why: 'it reads as a date' };

  // A phone number, in the shapes one is written in here.
  if (/^\+?\d[\d\s()+-]{6,}$/.test(one) && (one.match(/\d/g) ?? []).length >= 7) return { kind: 'phone', why: 'it reads as a number to call' };

  // A monogram: two or three letters and nothing else.
  if (/^[A-Z]([\s&.·|-]*[A-Z]){1,2}[.]?$/.test(one)) return { kind: 'monogram', why: 'it is two or three initials' };

  // Long enough to be somebody's sentence rather than anybody's name.
  if (words.length > 12) return { kind: 'message', why: 'it is a sentence rather than a name' };

  /*
   * An address before a venue, because an address usually names its venue
   * too. Two commas is the rule that catches the ones no word list would:
   * "One Rizal Park, Ermita, Manila" names no street and no city by name,
   * and a person's name almost never carries two commas.
   */
  if (STREETS.test(one)) return { kind: 'address', why: 'it names a street or a city' };
  if ((one.match(/,/g) ?? []).length >= 2) return { kind: 'address', why: 'it reads as an address, in parts' };
  if (PLACES.test(one)) return { kind: 'venue', why: 'it names a kind of place' };

  // Two names joined: the couple, or the celebrant and whoever stands with them.
  if (/^[^&]+\s*(&|\bและ\b|\band\b|\bat\b|\+)\s*[^&]+$/i.test(one) && words.length <= 8) {
    return { kind: 'namePair', why: 'it is two names joined — each wants a box of its own' };
  }

  /*
   * A name: a few capitalised words, nothing that says otherwise. One word
   * is somebody's first name or what they are called; two or more is their
   * name in full. It is worth telling apart, because a master carries both
   * — the cover in full, a line further down on first-name terms — and
   * they are two different questions.
   */
  if (words.length <= 5 && words.every((w) => /^[^a-z]*$/.test(w) || /^[A-ZÀ-ɏ]/.test(w))) {
    return words.length === 1
      ? { kind: 'name', why: 'it reads as one name' }
      : { kind: 'fullName', why: 'it reads as a name in full' };
  }
  if (words.length > 3) return { kind: 'message', why: 'it is a line of words' };
  return undefined;
}

/**
 * The questions each kind wants, in the order it wants them.
 *
 * Patterns against the *label* a question carries, never against its field
 * name, because the label is the one thing that is already in this
 * occasion's own words: a christening's cover asks for the "Child's full
 * name" and a wedding's for the "Bride's first name", and matching on those
 * means this list never has to know which occasion it is reading for. A
 * field renamed in the schema keeps working; a label reworded for customers
 * is the thing that would move it, and a reworded label is a five-second
 * fix here against a map of every field in the system.
 *
 * `show` is how a date or a time is said once bound (`FieldRef.show`), so a
 * stored `2026-12-18` reads as the words the master had in its place.
 */
const WANTS: Record<PlaceholderKind, { look: RegExp[]; show?: FieldRef['show'] }> = {
  /*
   * Nickname and first name before the bare word "name", because a great
   * many questions carry it — "GCash name", "Where to stay — Hotel" — and
   * a placeholder that is plainly a person wants the question that is
   * plainly a person. The bare pattern stays, last, for the occasions whose
   * celebrant field is called nothing more than that.
   */
  name: { look: [/first name/i, /nickname/i, /full name/i, /\bname\b/i] },
  fullName: { look: [/full name/i, /\bname\b/i, /first name/i] },
  // read and named, never wired on her behalf: see PlaceholderKind
  namePair: { look: [] },
  // the design's own heading, wired by the caller to the word it names
  heading: { look: [] },
  date: { look: [/^date$/i, /\bdate\b/i], show: 'date' },
  time: { look: [/^time$/i, /\btime\b/i, /seated by/i], show: 'time' },
  venue: { look: [/church ?\/? ?venue/i, /^venue$/i, /\bvenue\b/i, /hotel/i] },
  address: { look: [/full address/i, /^address$/i, /\baddress\b/i] },
  hashtag: { look: [/hashtag/i] },
  phone: { look: [/mobile/i, /\bphone\b/i, /by text/i, /\bnumber\b/i] },
  monogram: { look: [/monogram/i, /initials/i] },
  message: { look: [/message/i, /\bnote\b/i, /\bstory\b/i, /intro/i, /\bline\b/i] },
};

/** A question this can be wired to: its own key, the part it belongs to, and what it is called. */
export type Offer = { key: string; section: string; field: string; sub?: string; label: string; list?: boolean; type?: string };

/**
 * One of the design's own words: the key it is stored under, what it is
 * called, and every wording a design might have printed for it.
 *
 * `said` is what the reading matches on, and it is several strings rather
 * than one because there is no single right wording for a heading: the app
 * has its phrase, each look has its own, and the part has a name in this
 * occasion's words (`titleSaid` in design.ts gathers them). A master's
 * designer will have typed whichever they liked.
 */
export type Word = { key: string; label: string; said?: string[] };

/**
 * What to wire a placeholder to, read from its own words.
 *
 * Three answers are possible and they are not the same thing:
 *
 *   • **a question** — the customer's answer fills it, which is what a
 *     placeholder usually is;
 *   • **a word** — the design's own heading, the same for every guest;
 *   • **nothing**, with a reason, which is her turn.
 *
 * Offers already spoken for are passed in, so a master carrying the bride's
 * name on four pages does not wire all four to the same box and leave the
 * groom's unwired: a kind whose first choice is taken moves to its next,
 * and a kind with nothing left says nothing.
 *
 * The reason comes back either way, and is shown beside the answer, because
 * a guess is only worth having if she can see at a glance what it read.
 */
export function guessOffer(
  lines: string[],
  offers: Offer[],
  words: Word[] = [],
  taken: ReadonlySet<string> = new Set(),
  appPhrase?: (words: string) => string | undefined,
): { offer?: Offer; word?: string; copy?: string; show?: FieldRef['show']; why: string } | undefined {
  const said = lines.join(' ');
  const read = readPlaceholder(lines, words.flatMap((w) => [w.label, ...(w.said ?? [])]));
  if (!read) return undefined;
  if (read.kind === 'heading') {
    const flat = bare(said);
    const hit = words.find((w) => bare(w.label) === flat || (w.said ?? []).some((x) => bare(x) === flat));
    if (hit) return { word: hit.key, why: read.why };
  }
  /*
   * The app's own words, which are nobody's answer.
   *
   * It runs after the design's headings and before everything else, and it
   * is the only thing that can tell "Ninongs" from a name: the word reads
   * exactly like one, and that the app prints it itself is the whole of the
   * difference. Bound to the phrase rather than typed as English, it comes
   * out in Tagalog on a Tagalog invitation, which is what a master's typed
   * heading was standing in for.
   */
  const phrase = appPhrase?.(said);
  if (phrase) return { copy: phrase, why: 'these are the app\u2019s own words, so they follow the guest\u2019s language' };
  if (read.kind === 'heading') return { why: read.why };
  const want = WANTS[read.kind];
  /*
   * A row of a list last, always. "Ninongs — Name" is a real question and a
   * real answer, but it is the *first* ninong: a placeholder that is plainly
   * one person's name wants the one field that holds one person's name, and
   * a list is only the right answer when nothing else fits. Wired to a list
   * by accident, a heading becomes somebody's godfather.
   */
  for (const rows of [false, true]) {
    for (const look of want.look) {
      for (const offer of offers) {
        if (taken.has(offer.key) || Boolean(offer.list) !== rows) continue;
        if (look.test(offer.label)) return { offer, show: want.show, why: read.why };
      }
    }
  }
  // read, named, and hers to answer
  return { why: read.why };
}
