/**
 * A page drawn from the section it carries.
 *
 * The studio has always had two kinds of page and no way between them. A
 * **flow page** is laid out by its words: the app writes the section's
 * heading, the design's own lines and the customer's answers, and fits them
 * to whatever was typed — so there is nothing at a fixed place and nothing to
 * drag, and the canvas is an empty sheet. A **drawn page** places everything
 * by hand, and until this it started empty: ticking "Drawn page" gave a blank
 * sheet, not the writings that were already on it.
 *
 * So neither kind was the thing an owner actually asks for, which is *the
 * writings that are already in the system, on the page, to move and retype*.
 * This is that: it takes a flow page and hands back the same page drawn, with
 * one box per thing the section writes, stacked down it in reading order,
 * ready to be dragged where she wants them.
 *
 * Four things make it worth doing rather than telling her to place forty
 * boxes by hand:
 *
 *   • **Every box stays bound to its question.** A text box for the venue
 *     holds `{bind: {section, field}}`, not the words of whoever was sitting
 *     for the canvas — so the page keeps working for every customer who ever
 *     fills the form, exactly as Capiz's and Baby Blue's drawn pages do. She
 *     can retype any box into fixed words if she wants that instead.
 *   • **A box holds its binding and nothing else.** No fixed words behind it
 *     as a fallback: a guest whose answer is empty must see nothing, not the
 *     name of the question. The canvas draws an empty box labelled with what
 *     fills it (see `EditView` in components/invite/drawn.tsx), so she can
 *     see and move a box a guest would never be shown.
 *   • **A list is drawn row by row.** `story.timeline` and `gallery.photos`
 *     are lists, and a frame bound to a list without saying *which* row shows
 *     nothing at all — which is why Baby Blue's six milestones each name
 *     their index. So does every row seeded here, and the number of frames
 *     on the page is what caps the customer's own form (`frameLists`).
 *   • **The page keeps its sections.** A drawn page that names sections comes
 *     and goes with them (see the renderer), and the design still asks the
 *     customer for their fields. Clearing them would strand the page and stop
 *     the questions being asked.
 *
 * What it deliberately does not do: it does not guess a beautiful layout. A
 * stack down the middle is a starting point that can be read and moved, not a
 * design. The design is hers.
 */
import type { Occasion } from '@prisma/client';
import { askable, type Askable } from './asks';
import { ONE_SCREEN, TITLE_KEYS, isPicture, place, titleWord, type Element, type Line, type PageSpec, type PhotoEl, type TextEl, type WordKey } from './design';
import type { LineKey } from './looks';
import { SECTION_BY_KEY, fieldsFor, sectionLabel, type SectionKey } from './sections';

/** Where the stack starts and stops, as a share of the page's height. */
const TOP = 8;
const BOTTOM = 92;

/**
 * What a box wants of the page, as a share of the page's *width*.
 *
 * The page's own proportion (`ratio`, its height over its width) is worked
 * out from the sum of these, so they have to be in the one unit that does
 * not depend on it — and that is the width. A frame is a square as wide as
 * it is set, so its room is its width; a line of words is about a tenth of
 * the page's width tall, once its face and its air are counted.
 *
 * Spacing everything evenly instead would put a caption on top of the
 * photograph above it, because a frame is five times the height of a line.
 */
const TEXT_ROOM = 0.11;
/** The air between a frame and the writings that belong to it. */
const TIGHT = 0.02;
/**
 * How much taller than its contents the page is made, so there is always
 * air to share out between the groups. Without it a page that comes out
 * exactly full puts two frames edge to edge, and two frames edge to edge
 * read as one grey block rather than as two things to move.
 */
const AIR = 1.15;
/** The tallest a seeded page is made, however much it carries. */
const TALLEST = 7;
/** The most one press places, so a long section cannot bury the page. */
const CAP = 24;
/** How many rows of a list are drawn to start with, where the list allows them. */
const ROWS = 3;

/** How wide a box and a frame start. */
const TEXT_W = 82;
const PHOTO_W = 46;

export type Seeded = {
  page: PageSpec;
  /** boxes of words placed */
  boxes: number;
  /** frames placed */
  photos: number;
  /** what the cap left off the page */
  left: number;
  /** lists whose customer may fill more rows than were drawn */
  short: string[];
};

/**
 * The design's own writings on a section, over and above the answers.
 *
 * These are the "installed writings": the verse on the cover, the line above
 * the invitation, the note under the dress code. A flow page gets them from
 * the look without being asked; a drawn page has to carry a box for each, or
 * they are simply gone. The renderer is the authority for which line belongs
 * to which section — every entry here is a `line('…')` call in
 * components/invite/renderer.tsx, read off the section that makes it.
 */
const LINES_ON: Partial<Record<string, LineKey[]>> = {
  cover: ['cover'],
  verse: ['verse', 'verseRef'],
  countdown: ['countdown'],
  ceremony: ['invitation'],
  reception: ['venue', 'interlude2'],
  entourage: ['entourage'],
  sponsors: ['sponsors'],
  dressCode: ['dressCode', 'dressNote', 'gentsNote', 'ladiesNote'],
  gift: ['giftThanks'],
  story: ['story'],
  gallery: ['gallery', 'galleryNote'],
  'gallery-video': ['galleryVideo', 'galleryClose'],
  program: ['program'],
  moment: ['moment1', 'moment2', 'moment3'],
  social: ['social', 'socialCta'],
  guestbook: ['guestbook'],
  photos: ['photos', 'photosIntro'],
  contact: ['contact', 'contactNote'],
  closing: ['closing', 'closingMessage'],
};

/**
 * What a page's key is called in words.
 *
 * A page names *page* sections, and two of those are not sections of the
 * form at all: `verse` and `gallery-video` ride along on other sections, and
 * asking the occasion to name them throws. So the occasion is asked only
 * about the keys it knows, and the others are titled from the key itself —
 * which is also what stops this from taking the studio down when Capiz's
 * cover page, which carries the verse, is seeded.
 */
function nameOf(key: string, occasion: Occasion): string {
  if (key in SECTION_BY_KEY) return sectionLabel(key as SectionKey, occasion);
  return key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * How many rows of a list to draw.
 *
 * A drawn page holds the rows it draws and no more, so this is a starting
 * point rather than the list: three, or the list's own cap where that is
 * smaller — `gallery.little` holds two pictures, so drawing three frames for
 * it would draw one that can never be filled. A list field's `max` is its
 * number of rows (see `withLimits`, which leaves it alone while it puts
 * letter limits on the writings inside).
 */
function rowsOf(section: string, occasion: Occasion, field: string): number {
  if (!(section in SECTION_BY_KEY)) return ROWS;
  const f = fieldsFor(section as SectionKey, occasion).find((x) => x.key === field);
  return Math.max(1, Math.min(ROWS, f?.max ?? ROWS));
}

/** Whether the customer can fill more rows of a list than were drawn. */
function capOf(section: string, occasion: Occasion, field: string): number | undefined {
  if (!(section in SECTION_BY_KEY)) return undefined;
  return fieldsFor(section as SectionKey, occasion).find((x) => x.key === field)?.max;
}

/** A box of words: what it reads, and the name it is known by while it is empty. */
function wordsBox(id: string, sources: Line['sources'], role: Line['role'] = 'body'): TextEl {
  return { id, kind: 'text', block: 'free', y: 0, x: 50, w: TEXT_W, anchor: 'centre', lines: [{ role, align: 'center', sources }] };
}

/**
 * The heading a section is known by.
 *
 * Only where the design has a word for one: `TITLE_KEYS` is the list of
 * headings a design writes, and it is deliberately short. A cover has no
 * heading — it has the names — so seeding the word "Cover" onto it would put
 * a word on a guest's first page that nobody asked for.
 */
function headingOf(key: string, occasion: Occasion): Line[] | undefined {
  if (!TITLE_KEYS.includes(key as never)) return undefined;
  const word: WordKey = titleWord(key as never);
  return [{ role: 'title', align: 'center', sources: [{ word }, { fixed: { en: nameOf(key, occasion) } }] }];
}

export function drawFromSection(page: PageSpec, occasion: Occasion): Seeded {
  const nothing: Seeded = { page, boxes: 0, photos: 0, left: 0, short: [] };
  // Already hers to place: nothing to seed, and nothing to overwrite.
  if (page.drawn && (page.elements?.length ?? 0) > 0) return nothing;

  const words = askable(occasion, 'text');
  const pictures = askable(occasion, 'photo');
  /*
   * Built in groups rather than one long list. A group is one thing that has
   * to stay together: a row of a list is its frame and the writings that
   * caption it, and a caption two screens from its photograph is not
   * something anybody would drag into place. Everything else is a group of
   * one. The air goes between groups; inside a group the members sit tight.
   */
  const made: Element[][] = [];
  const short: string[] = [];
  let n = 0;
  const id = (kind: string) => `${kind}-${page.key}-${++n}`;

  const bindOf = (ask: Askable, index?: number) => ({
    section: ask.section,
    field: ask.field,
    ...(ask.sub ? { sub: ask.sub } : {}),
    ...(index === undefined ? {} : { index }),
  });

  for (const key of page.sections) {
    const head = headingOf(key, occasion);
    if (head) made.push([{ id: id('head'), kind: 'text', block: 'head', y: 0, x: 50, w: TEXT_W, anchor: 'centre', lines: head } satisfies TextEl]);

    // The design's own writings, which a flow page gets from the look and a
    // drawn page has to carry.
    for (const line of LINES_ON[key] ?? []) made.push([wordsBox(id('line'), [{ word: line }])]);

    const mine = { text: words.filter((a) => a.section === key), photo: pictures.filter((a) => a.section === key) };

    // The plain answers, in the order the form asks for them.
    for (const ask of mine.text.filter((a) => !a.list)) made.push([wordsBox(id('words'), [{ bind: bindOf(ask) }])]);
    for (const ask of mine.photo.filter((a) => !a.list)) {
      made.push([{ id: id('photo'), kind: 'photo', y: 0, x: 50, w: PHOTO_W, anchor: 'centre', bind: bindOf(ask) } satisfies PhotoEl]);
    }

    /*
     * Then each list, row by row: the picture first and the writings that go
     * with it under it, the way Baby Blue's milestones and polaroids are
     * drawn. Row by row rather than field by field, because a caption three
     * screens away from its photograph is not something anybody would drag
     * into place.
     */
    const lists = [...new Set([...mine.photo, ...mine.text].filter((a) => a.list).map((a) => a.field))];
    for (const field of lists) {
      const rows = rowsOf(key, occasion, field);
      const cap = capOf(key, occasion, field);
      if (cap !== undefined && cap > rows) short.push(`${nameOf(key, occasion)} — ${field}`);
      for (let i = 0; i < rows; i++) {
        const row: Element[] = [];
        for (const ask of mine.photo.filter((a) => a.list && a.field === field)) {
          row.push({ id: id('photo'), kind: 'photo', y: 0, x: 50, w: PHOTO_W, anchor: 'centre', bind: bindOf(ask, i) } satisfies PhotoEl);
        }
        for (const ask of mine.text.filter((a) => a.list && a.field === field)) {
          row.push(wordsBox(id('words'), [{ bind: bindOf(ask, i) }], 'caption'));
        }
        made.push(row);
      }
    }
  }

  if (!made.length) return nothing;

  /*
   * A long section is capped rather than allowed to bury the page: a wedding
   * entourage asks for fourteen lists of names, and nobody can work on two
   * hundred boxes. What is left off is counted and said out loud — a page
   * that quietly drops half a section is worse than one that admits it. A
   * row is kept whole or left off whole.
   */
  const groups: Element[][] = [];
  let taken = 0;
  for (const group of made) {
    if (taken + group.length > CAP && taken > 0) break;
    groups.push(group);
    taken += group.length;
  }
  const left = made.reduce((a, g) => a + g.length, 0) - taken;

  /*
   * The stack, and a page tall enough to hold it.
   *
   * Everything is measured as a share of the page's *width*, because the
   * page's height is what is being worked out: the boxes ask for the room
   * they need, and the page's proportion is the sum of that over the band
   * they stand in. One screen at the least — a shorter page than the phone
   * it is read on looks like a mistake — and never past `TALLEST`, because
   * a page nobody can scroll to the end of is not a page.
   *
   * A drawn page takes its height from its ground, so that is where the
   * number goes, and only for a plain colour. A ground that is a picture has
   * the proportions of the picture, which are not ours to change: the stack
   * spreads over whatever height that is, because these are shares rather
   * than millimetres.
   */
  const roomOf = (el: Element) => (el.kind === 'photo' ? ((el.w ?? PHOTO_W) / 100) * (el.aspect ?? 1) : TEXT_ROOM);
  const roomIn = (group: Element[]) => group.reduce((a, el) => a + roomOf(el), 0) + TIGHT * (group.length - 1);
  const band = (BOTTOM - TOP) / 100;
  const wants = groups.reduce((a, g) => a + roomIn(g), 0);
  const ratio = Math.min(TALLEST, Math.max(ONE_SCREEN, (wants * AIR) / band));
  const ground = page.ground && isPicture(page.ground)
    ? page.ground
    : { ...(page.ground ?? { color: 'bg' as const }), ratio: Math.round(ratio * 1000) / 1000 };

  /*
   * Down the page. A share of the width becomes a share of the *height* by
   * dividing by the proportion, which is the one conversion in here; the air
   * left over after every group has its room is shared out between them, and
   * where there is none to share the stack is squeezed to stay on the page.
   */
  const down = (room: number) => (room / ratio) * 100;
  const used = groups.reduce((a, g) => a + down(roomIn(g)), 0);
  const squeeze = used > BOTTOM - TOP ? (BOTTOM - TOP) / used : 1;
  const gap = groups.length > 1 ? Math.max(0, (BOTTOM - TOP - used) / (groups.length - 1)) : 0;

  let at = TOP;
  const placed: Element[] = [];
  for (const group of groups) {
    for (const el of group) {
      const room = down(roomOf(el)) * squeeze;
      // Rounded to a hundredth: she reads and types these in the panel, and
      // nobody needs ten decimal places of a page.
      placed.push({ ...el, y: place(Math.round((taken === 1 ? 50 : at + room / 2) * 100) / 100) });
      at += room + down(TIGHT) * squeeze;
    }
    at += gap - down(TIGHT) * squeeze;
  }

  return {
    page: { ...page, drawn: true, ground, elements: placed },
    boxes: placed.filter((e) => e.kind === 'text').length,
    photos: placed.filter((e) => e.kind === 'photo').length,
    left,
    short,
  };
}
