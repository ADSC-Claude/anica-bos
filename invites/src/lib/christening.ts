import type { Element, FieldRef, Ground, Line, LineRole, PageSpec, PhotoEl, ShapeEl, Source, TextEl } from './design';

/**
 * The christening, on the sixteen grounds she drew in Canva.
 *
 * The first design built from artwork rather than around it. Every page is
 * one of her backgrounds with the words taken off (`scripts/canva-grounds.py`)
 * and drawn again live, in the place she put them, so a customer's own baby's
 * name lands where "Lucas Andrei" was.
 *
 * Seven pages are the invitation's column. The other nine sit behind the
 * Highlights page in three booklets a guest reaches by tapping: the big
 * envelope opens **The Details**, the blue oval opens **Our Story**, the
 * small sealed envelope opens **RSVP**. A guest who taps nothing reads seven
 * pages and has still read an invitation; a guest who taps all three reads
 * sixteen.
 *
 * Why a hub at all rather than sixteen pages in a row: her design says so.
 * The Highlights page is drawn as a desk with things laid on it, and things
 * on a desk are picked up, not scrolled past.
 *
 * ## Where the numbers come from
 *
 * Nothing here is eyeballed, and nothing here is a round number. Every
 * writing on every page was read out of her PDF — its baseline, the middle
 * of it, its point size, its colour, its angle — by `scripts/canva-text.py`,
 * and this file is that table with the words replaced by the questions that
 * fill them. `pdfs/survey.json` is the table itself; run the script again
 * after a new export and the differences are the design changes.
 *
 * Four things that arithmetic alone does not settle:
 *
 * - **A baseline, not a top.** A box is placed by its top, and a line of
 *   type sits some way below the top of its box — how far depends on the
 *   face and on the leading. Placing by her *top* therefore puts two
 *   different faces in two different places; placing by her *baseline*, the
 *   line every typesetter measures from, puts them where she drew them.
 *   `sheet()` does the conversion, and `HALF` is the one measured number it
 *   needs per face (see its note).
 *
 * - **She set her own leading.** Canva lets a designer pull the lines of a
 *   paragraph together, and she did: her date sits 0.99 of its own size
 *   under the line above it and her venue 1.20, where the stylesheet's is
 *   neither. Every box that holds more than one line carries the leading
 *   measured between her baselines. This is the fault that reads as "the
 *   spaces between them, some is too far, some is too tight".
 *
 * - **The faces are not her faces.** Westonia, Loubag and TT Nooks Script
 *   are licensed to Canva. Parisienne stands in for TT Nooks, Allura for
 *   Westonia, Abhaya Libre Bold for Loubag. Two faces at one point size do
 *   not cover the same width, so every fixed word set in a substitute is
 *   sized to cover *her* width rather than to carry her point size —
 *   measured in the browser with the real face loaded, not guessed. Where a
 *   customer's own words go in, the size is the one that made her demo name
 *   the width she drew, and `room` caps what the form will accept.
 *
 * - **Her pages butt up, they do not dissolve.** Every page of hers is a
 *   finished picture edge to edge, so the column's usual feathered join —
 *   which exists for Capiz, where one long picture runs down several pages —
 *   would fade the top of each into the bottom of the one before and take
 *   her corner clouds with it. `seam: 0` on all sixteen.
 *
 * - **A colour is a role.** Her four inks are the palette's four: azure
 *   #2b5275 is `ink`, the peach #e6b181 is `accent`, the pastel grey
 *   #67676d is `muted`, and white is `surface` — which is why `surface`
 *   exists as a line colour at all. Where she wrote in white she wrote over
 *   her own dark pictures, and a white line that came out azure is a line
 *   the guest cannot read.
 */

/** cqw from her point size on an 810pt-wide page: one hundredth of the column. */
const pt = (n: number) => Math.round((n / 8.1) * 100) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Face = NonNullable<TextEl['face']>;
type Ink = NonNullable<Line['color']>;

/**
 * Half the difference between a face's ascent and its descent, as a share of
 * the size — the one number that turns a leading and a size into the drop
 * from the top of a box to the first baseline.
 *
 * A line box is `leading × size` tall; the glyphs' own box is
 * `(ascent + descent) × size` and sits in the middle of it; the baseline is
 * `ascent × size` down from the top of that. Put together, the drop is
 * `size × (leading/2 + (ascent − descent)/2)` — so the ascent and the
 * descent only ever appear as half their difference, and one number a face
 * is enough.
 *
 * Measured in Chromium with the faces loaded (`scripts/canva-text.py
 * --metrics` prints them), not read off the font files: what the browser
 * uses for a line box is what matters, and it is not always what the file
 * says.
 */
/*
 * The two answers to "how do guests send a gift", and which layout each takes.
 *
 * The empty string is in QR_WAY on purpose. Blank means the question was
 * never put — every invitation built before the field existed, and every one
 * a customer has not reached yet — and blank has always behaved as the QR
 * page, because that is the only page there was. Leaving it out of both lists
 * would draw *neither* layout: a gift page with a heading and nothing under
 * it. The flow renderer treats blank the same way (renderer.tsx, Gift), and
 * the two have to agree or the same invitation says different things on a
 * drawn page and a scrolled one.
 */
const QR_WAY = ['', 'gcash'];
const BANK_WAY = ['bank', 'none'];

const HALF: Record<Face, number> = {
  body: 0.218,    // Abhaya Libre
  display: 0.218, // Abhaya Libre
  names: 0.229,   // Parisienne
  script: 0.146,  // Allura
};

/** the leading a box of one line gets, where she set none worth keeping */
const LEAD = 1.25;

/** Everything a writing needs to land where she drew it. */
type Set = {
  /** her baseline, as a share of this page's own height */
  base: number;
  /** her point size over 8.1, in cqw */
  size: number;
  face?: Face;
  weight?: number;
  role?: LineRole;
  color?: Ink;
  /** the middle of her line, as a share of the width; the default is the page's middle */
  cx?: number;
  /** the box, as a share of the width — hers plus the room a longer answer needs */
  w?: number;
  align?: 'left' | 'center' | 'right';
  /** her leading, measured between her baselines, as a multiple of the size */
  lead?: number;
  /** her angle, positive clockwise, the way CSS turns things */
  turn?: number;
  /** what the form will accept in this box */
  room?: number;
  /** nothing to say, nothing drawn */
  hide?: true;
  /** her own letter-spacing, where the role's is not it */
  track?: number;
  /** it pulses, the way a lit sign does: the words that say where to tap */
  blink?: true;
  /** the line she drew under it */
  rule?: true;
  /** drawn as a button rather than set as type: the pill and the mark of where it goes */
  button?: true;
  /** it comes up once whatever it is written on has arrived */
  after?: number;
  /** her box is set in capitals, however the family types their answer */
  caps?: true;
  /** on a row of `mixed`: air above this line in cqw, so the gap she drew survives a wrap */
  space?: number;
  /** her coloured pill behind the words, taken off the artwork so it follows them */
  mark?: 'accent' | 'surface';
  /** the id of the element a tap here plays */
  taps?: string;
  /** drawn only when an answer says so */
  when?: { section: string; field: string; is?: string[]; filled?: boolean };
  /** what a tap on it does, where it leaves the invitation */
  go?: { to: 'calendar' | 'maps' | 'waze'; of?: string };
  /**
   * Above the pieces, where she wrote on one.
   *
   * A writing needs this only when a `piece` is laid over the place it sits:
   * her CLICK HERE is printed *on* the envelope, and the envelope's front is
   * an element in front of the card (z 2), so without a z of its own the
   * words went behind it and the one instruction on the object vanished.
   */
  z?: number;
};

/**
 * A page's typesetter, made once per page because the conversion needs the
 * page's own shape.
 *
 * `y` is a share of the page's *height* and `size` a share of its *width*,
 * so turning a size into a drop needs the ratio between them — which is the
 * page's own, and different on nine of her sixteen.
 */
const sheet = (ratio: number) => {
  const at = (s: Set, lead: number) => r2(s.base - (s.size * (lead / 2 + HALF[s.face ?? 'body'])) / ratio);
  /*
   * `own` is what the *row* set, as against what the box set: a row of a
   * `mixed` box may carry its own leading, its own gap above it, its own
   * cap on the letters and its own capitals, and only the keys it names
   * are written onto the line. A box of one line names none of them and
   * keeps the box's.
   */
  const line = (s: Set, sources: Source[], own: Partial<Set> = {}): Line => ({
    role: s.role ?? 'body',
    sources,
    align: s.align ?? 'center',
    size: s.size,
    color: s.color ?? 'ink',
    ...(own.lead !== undefined ? { leading: own.lead } : {}),
    ...(own.space !== undefined ? { space: own.space } : {}),
    ...(own.room !== undefined ? { room: own.room } : {}),
    ...(own.caps ? { caps: true as const } : {}),
  });
  const box = (id: string, s: Set, lines: Line[]): TextEl => {
    const lead = s.lead ?? LEAD;
    return {
      id, kind: 'text', block: 'free',
      x: s.cx ?? 50, y: at(s, lead), w: s.w ?? 88, anchor: 'top',
      face: s.face ?? 'body', size: s.size, leading: lead,
      ...(s.weight ? { weight: s.weight } : {}),
      ...(s.track !== undefined ? { tracking: s.track } : {}),
      ...(s.turn ? { rotate: s.turn } : {}),
      ...(s.z ? { z: s.z } : {}),
      ...(s.room ? { room: s.room } : {}),
      ...(s.hide ? { hidden: 'whenEmpty' as const } : {}),
      ...(s.blink ? { motion: { idle: 'flicker' as const } } : {}),
      ...(s.rule ? { rule: true as const } : {}),
      ...(s.button ? { button: true as const } : {}),
      ...(s.caps ? { caps: true as const } : {}),
      ...(s.mark ? { highlight: s.mark } : {}),
      ...(s.after ? { motion: { enter: 'fade' as const, delay: s.after } } : {}),
      ...(s.taps ? { taps: s.taps } : {}),
      ...(s.when ? { when: s.when } : {}),
      ...(s.go ? { go: s.go } : {}),
      lines,
    };
  };
  return {
    /** one line of words on her baseline */
    one: (id: string, s: Set, ...sources: Source[]) => box(id, s, [line(s, sources)]),
    /** several lines in one box, at her leading */
    many: (id: string, s: Set, groups: Source[][]) => box(id, s, groups.map((g) => line(s, g))),
    /** several lines of different sizes in one box, at her leading */
    mixed: (id: string, s: Set, rows: Array<Partial<Set> & { src: Source[] }>) =>
      box(id, s, rows.map((row) => line({ ...s, ...row }, row.src, row))),
  };
};

/**
 * A page's picture.
 *
 * `cut` is for a page that can outgrow it — the RSVP with its form, Good to
 * know with however many questions the family wrote. Her banner is in the
 * head and her clouds are in the foot, and only the band of plain sky
 * between them stretches, so nothing she drew changes shape however long
 * the page turns out (`scripts/canva-slices.py` cuts them).
 */
const ground = (slug: string, ratio: number, cut?: true): Ground => ({
  url: `/christening/${slug}.webp`,
  ratio,
  ...(cut ? { slices: { top: `/christening/${slug}-top.webp`, mid: `/christening/${slug}-mid.webp`, foot: `/christening/${slug}-foot.webp` } } : {}),
  // the fill behind her clouds, sampled off the ground rather than chosen, so
  // a page taller than its picture carries the same blue past both edges
  top: '#e7f3ff',
  bottom: '#e7f3ff',
});

const say = (s: string): Source => ({ fixed: { en: s } });
const bind = (section: string, field: string, rest: Omit<FieldRef, 'section' | 'field'> = {}): Source => ({ bind: { section, field, ...rest } });

/**
 * The invisible rectangle a guest taps to open a booklet.
 *
 * `opens` belongs on the artwork, and on the two shipped designs it is: a
 * shut door carries it, because the door is an element. Here the envelope
 * and the oval are painted into the ground — they are not elements and there
 * is nothing to hang it on — so the tap target is an invisible rectangle the
 * size of the object. It is the honest shape of the problem rather than the
 * preferred one, and it is the reason the rectangle covers the whole object
 * and not just her caption: a guest aims at the envelope.
 *
 * Her CLICK HERE and the rule under it are gone from the ground, because the
 * live one pulses and a drawn one cannot — and a drawn underline beneath a
 * live one is two underlines.
 */
const opens = (id: string, booklet: string, box: { x: number; y: number; w: number; h: number }): ShapeEl => ({
  id, kind: 'shape', shape: 'rect',
  x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w, h: box.h,
  anchor: 'centre', fill: 'transparent', opens: booklet,
});

/** A piece cut out of her own artwork, laid back on the page so it can move. */
const piece = (id: string, url: string, at: { cx: number; cy: number; w: number; aspect: number; turn?: number; z?: number }, extra: Partial<PhotoEl> = {}): PhotoEl => ({
  id, kind: 'photo', bind: { asset: url },
  x: at.cx, y: at.cy, w: at.w, aspect: at.aspect, anchor: 'centre',
  ...(at.turn ? { rotate: at.turn } : {}),
  ...(at.z ? { z: at.z } : {}),
  hidden: 'never',
  ...extra,
});

// ───────────────────────── the seven in the column ─────────────────────────
const COVER = sheet(1.7778);
const COUNTDOWN = sheet(0.3241);
const HUB = sheet(1.7778);
const FAQ = sheet(1.1111);
const SOCIAL = sheet(0.5556);
const HELP = sheet(0.5556);
const CLOSE = sheet(0.463);
// ───────────────────────────── and the nine behind ─────────────────────────
const STORY = sheet(1.7778);
const GALLERY = sheet(1.7778);
const INVITE = sheet(1.7778);
const GODPARENTS = sheet(1.1111);
const VENUE = sheet(1.2963);
const DRESS = sheet(1.7778);
const PROGRAM = sheet(1.4815);
const GIFT = sheet(1.1111);
const RSVP = sheet(1.7778);

/**
 * Her four milestones and her five programme slots, down the drawn spine:
 * three lines a row, each on its own baseline because she gave the three
 * different gaps, and the row alternating side so the page reads down the
 * spine rather than down one margin.
 */
/*
 * The gap from the title's baseline down to the sentence's, said as air
 * rather than as a second baseline: 1.73cqw.
 *
 * Her two pages set the same distance — 2.975% of the story page's height
 * and 3.570% of the programme's, which are both 5.29cqw once the pages'
 * own shapes are taken out. What the two lines take up on their own is
 * `size × (leading/2 − HALF)` below the first baseline and
 * `size × (leading/2 + HALF)` above the second: 3.66 × 0.407 plus
 * 2.32 × 0.893, or 3.56cqw. The 1.73 is the difference.
 *
 * It has to be a margin and not a leading. A leading wide enough to carry
 * the gap would carry it again between the sentence's *own* lines, and a
 * description is usually more than one line.
 */
const ROW_GAP = 1.73;

const ROWS = (
  S: ReturnType<typeof sheet>,
  key: string,
  section: string,
  field: string,
  first: string,
  rows: Array<{ left: number; date: number; title: number; text: number }>,
): Element[] => rows.flatMap((row, i) => [
  S.one(`${key}-${i + 1}-when`, { base: row.date, size: 4.5, face: 'script', cx: row.left + 15, w: 30, align: 'left', hide: true, room: 18 },
    bind(section, field, { index: i, sub: first })),
  /*
   * The title and the sentence in one box, not two.
   *
   * She typed TITLE, one short word, so at her baselines the two never met.
   * A real one is "Christening Mass" or "Games and Giveaways", which takes
   * two lines in a column this narrow — and a second box pinned to its own
   * baseline does not know that, so the sentence was printing straight
   * through it. One box, and the sentence follows the title down.
   */
  S.mixed(`${key}-${i + 1}-what`, { base: row.title, size: pt(29.64), cx: row.left + 15, w: 30, align: 'left', hide: true, room: 22 }, [
    { caps: true, src: [bind(section, field, { index: i, sub: 'title' })] },
    { size: pt(18.77), lead: 1.35, space: ROW_GAP, room: 90,
      src: [bind(section, field, { index: i, sub: key === 'story' ? 'text' : 'note' })] },
  ]),
]);

/**
 * Sixteen pages: seven in the column, nine in three booklets.
 *
 * The order is hers. `booklet` is the one field that takes a page off the
 * flow, so the nine sit in this list exactly where they read, one booklet
 * after another, rather than being lifted into a list of their own — which
 * is what lets the studio move a page between the flow and a booklet by
 * changing a single field.
 */
export const CHRISTENING_PAGES: PageSpec[] = [
  // ─────────────────────────── the column ───────────────────────────
  {
    key: 'cover', label: { en: 'Cover' }, sections: ['cover'], seam: 0, drawn: true,
    ground: ground('cover', 1.7778),
    elements: [
      COVER.one('cover-the', { base: 17.961, size: pt(35), color: 'accent', face: 'display', weight: 700 }, say('The')),
      // Parisienne for TT Nooks Script: 90.4pt covers the 368pt she drew, where
      // her own 80pt would have come out narrow
      COVER.one('cover-word', { base: 24.215, size: 11.16, face: 'names', role: 'script', w: 92 },
        { word: 'cover' }, say('Christening')),
      COVER.one('cover-of', { base: 27.225, size: pt(30), color: 'accent', face: 'display', weight: 700, cx: 51.34 }, say('of our son')),
      COVER.one('cover-name', { base: 45.455, size: 11.52, color: 'accent', face: 'names', role: 'script', w: 92, room: 17 },
        bind('cover', 'childFull', { show: 'given' })),
      COVER.one('cover-family', { base: 48.185, size: pt(40), color: 'accent', face: 'display', weight: 700, room: 28 },
        bind('parents', 'familyName')),
      COVER.one('cover-date', { base: 60.880, size: pt(35), color: 'accent', cx: 50.68, caps: true },
        bind('cover', 'date', { show: 'date' })),
      COVER.one('cover-time', { base: 63.276, size: pt(35), color: 'accent', cx: 50.68, caps: true },
        bind('cover', 'time', { show: 'time' })),
      // her venue runs to two lines 1.20 of its size apart; the box is wide
      // enough to break in the same place and no wider
      COVER.one('cover-church', { base: 66.311, size: pt(30), color: 'accent', cx: 51.34, w: 46, lead: 1.2, room: 40, caps: true },
        bind('ceremony', 'venue')),
      COVER.one('cover-click', { base: 93.698, size: pt(25), color: 'muted', cx: 51.34, w: 40, role: 'caption', blink: true, rule: true, taps: 'cover-print' },
        say('CLICK HERE')),
      /*
       * The print, and the tap that pulls it out.
       *
       * Her camera is in the ground, where it belongs — it never moves. What
       * moves is the print, cut out of her own page (`scripts/canva-cut.py`)
       * and laid back in the frame she drew it in, with the frame clipping:
       * at rest the picture sits a whole height below the frame and cannot
       * be seen at all, and the tap brings it up, so it reads as coming out
       * of the slot rather than fading in on top of the camera.
       *
       * The frame's foot is a hair inside the camera's top plate, which is
       * where the slot is, so the print appears from behind it.
       *
       * Two things carry the tap: her own CLICK HERE, and an invisible
       * rectangle over the camera — because a guest aims at the camera
       * whatever the words underneath it say.
       */
      piece('cover-print', '/christening/parts/instax-print.webp',
        { cx: 51.39, cy: 79.40, w: 23.70, aspect: 1.1367 }, { motion: { enter: 'slide' } }),
      { id: 'cover-tap', kind: 'shape', shape: 'rect', x: 50.7, y: 92, w: 36, h: 18,
        anchor: 'centre', fill: 'transparent', taps: 'cover-print' },
    ],
  },
  {
    /*
     * Her band says "before the big day" and nothing else — the numbers were
     * never on it, because numbers that change every second cannot be drawn
     * into a picture. So the page is `live`: her label stays exactly where
     * she set it, near the foot of the band, and the section's own counter
     * runs in the sky above it. The section's copy of the label is hidden by
     * the live rule, the way every live page's heading is, because the design
     * has already written it.
     *
     * `headPad` is small and the page grows. The counter is set in rem rather
     * than in the page's own units — it is the app's furniture, not her
     * artwork — so no single gap can hold at every width; four is the value
     * that keeps it clear of her line on a phone and still looks deliberate
     * on a laptop.
     */
    key: 'countdown', label: { en: 'Countdown' }, sections: ['countdown'], seam: 0, drawn: true, live: true, grow: true, headPad: 4,
    ground: ground('countdown', 0.3241, true),
    elements: [
      COUNTDOWN.one('countdown-line', { base: 76.804, size: 3.87, color: 'accent', face: 'names', role: 'script', w: 62, room: 34 },
        bind('countdown', 'label'), { word: 'countdown' }, say('before the big day')),
    ],
  },
  /**
   * The hub. It carries no section of its own, because everything on it is a
   * door rather than a part of the invitation.
   *
   * Every writing on it is turned, because every writing on it is written on
   * something that is turned — the card in the envelope leans nine degrees
   * counter-clockwise, the little RSVP envelope ten the other way, the oval's
   * script fourteen. Set straight, they sat across her artwork rather than on
   * it. The angles are hers, read off the export; each is the angle at the
   * *middle* of her line, because that is the point an element turns about.
   *
   * `peekEnd` stops the shop's preview here, which is the right place for it:
   * the hub is the whole idea of the design in one screen, and the nine pages
   * behind it are the thing being bought.
   */
  {
    key: 'highlights', label: { en: 'Highlights' }, sections: [], seam: 0, drawn: true, peekEnd: true,
    ground: ground('highlights', 1.7778),
    elements: [
      opens('hl-open-details', 'details', { x: 8, y: 8, w: 62, h: 30 }),
      /*
       * The card, drawn out of the envelope as the guest arrives.
       *
       * She asked for it on turning to the page rather than on a tap, and
       * that is right: the envelope already carries a tap, and it opens The
       * Details. Two things on one tap is one of them not happening.
       *
       * She drew the card as tall as the envelope and pushed all the way in,
       * so there is nowhere to hide it: move it a hair and its bottom corner
       * appears below the envelope's. What *can* be hidden is everything
       * above the envelope's mouth, so the card is cut along that line
       * (`scripts/canva-cut.py`) and the piece above it rises inside a frame
       * whose foot is the mouth. The pocket and the seal never move and stay
       * in the ground.
       */
      // Cut at the V's point, not at the pocket's top edge. Her pocket is a
      // rectangle with a wide notch out of its top and the card shows
      // *through* the notch, so a cut at the top edge ended the card a third
      // of the way up it and left the page showing under her own writing.
      piece('hl-card', '/christening/parts/envelope-card.webp',
        { cx: 36.99, cy: 23.64, w: 44.91, aspect: 0.6596, turn: -9.36, z: 1 }, { motion: { enter: 'slide' } }),
      /*
       * The flap, and the seal on its point, in front of the card.
       *
       * Her envelope is a front-flap one: the flap is folded *down* over the
       * body with the wax seal at its point, and the card stands up behind
       * it. So the mouth — the straight line the card slides through — runs
       * behind the flap, and in the middle of the envelope it is a long way
       * above the flap's own edge. Clipping the card at the mouth alone made
       * it appear out of nothing halfway up the white, which is what read as
       * "it came from the middle part".
       *
       * With the flap in front, the strip between the mouth and the flap's
       * diagonal is covered, so the card is only ever seen once it is past
       * the flap's edge — which by the seal is exactly where a card comes
       * out of an envelope.
       */
      piece('hl-flap', '/christening/parts/envelope-pocket.webp',
        { cx: 41.58, cy: 33.12, w: 50.46, aspect: 0.6614, turn: -9.07, z: 2 }),
      piece('hl-seal', '/christening/parts/envelope-seal.webp',
        { cx: 41.64, cy: 31.91, w: 8.52, aspect: 1.0026, z: 3 }),
      HUB.one('hl-details', { after: 1100, base: 18.220, size: pt(20), cx: 36.33, w: 40, turn: -8.8 }, say('The Details')),
      HUB.one('hl-of', { after: 1100, base: 21.395, size: pt(23), cx: 37.54, w: 44, turn: -8.7 }, say('The Christening of')),
      HUB.one('hl-name', { after: 1100, base: 24.531, size: 5.25, color: 'accent', face: 'names', role: 'script', cx: 38.93, w: 48, turn: -8.3, room: 20 },
        bind('cover', 'childFull', { show: 'given' })),
      HUB.one('hl-date', { after: 1100, base: 27.134, size: pt(23), cx: 40.18, w: 40, turn: -8.0 },
        bind('cover', 'date', { show: 'dateShort' })),
      // on the envelope, so above it: the front is z 2 and this went under it
      HUB.one('hl-details-click', { base: 37.826, size: pt(25), color: 'muted', cx: 43.16, w: 34, turn: -7.2, role: 'caption', blink: true, rule: true, z: 4 },
        say('CLICK HERE')),

      opens('hl-open-rsvp', 'rsvp', { x: 52, y: 42, w: 36, h: 20 }),
      HUB.one('hl-kindly', { base: 49.222, size: pt(25), cx: 70.07, w: 26, turn: 10.0 }, say('Kindly')),
      // Loubag, in Abhaya Libre Bold: 38.85pt covers the 87.8pt she drew
      HUB.one('hl-rsvp', { base: 52.048, size: 4.8, cx: 69.43, w: 26, turn: 10.7, face: 'display', weight: 700 }, say('RSVP')),
      HUB.one('hl-rsvp-click', { base: 60.493, size: pt(25), color: 'muted', cx: 66.04, w: 32, turn: 9.0, role: 'caption', blink: true, rule: true },
        say('CLICK HERE')),

      opens('hl-open-story', 'story', { x: 14, y: 44, w: 44, h: 30 }),
      // her two lines, at her two sizes and her two angles: one word over the
      // other down the oval, which is the whole of why it does not look stiff
      HUB.one('hl-our', { base: 61.590, size: 8.13, color: 'surface', face: 'script', role: 'script', cx: 35.51, w: 30, turn: -10.0 }, say('Our')),
      HUB.one('hl-story', { base: 65.975, size: 12.11, color: 'surface', face: 'script', role: 'script', cx: 36.59, w: 40, turn: -14.0 }, say('Story')),
      HUB.one('hl-story-click', { base: 71.686, size: pt(30), color: 'muted', cx: 41.41, w: 34, turn: -12.8, role: 'caption', blink: true, rule: true },
        say('CLICK HERE')),

      // her CLICK FOR MUSIC is set around the rim of the disc, which no box of
      // words can do; it is cut out of her own page and laid back on it, and
      // it pulses with the rest of them
      piece('hl-music', '/christening/parts/click-for-music.webp',
        { cx: 77.55, cy: 29.97, w: 20.09, aspect: 0.8525 }, { motion: { idle: 'flicker' }, song: true }),
    ],
  },
  /**
   * The FAQ page she left blank. It grows, because a customer may write three
   * questions or ten, and the section draws the pairs itself.
   */
  {
    key: 'faq', label: { en: 'Good to know' }, sections: ['faq'], seam: 0, drawn: true, grow: true, live: true, headPad: 22,
    ground: ground('faq', 1.1111, true),
    elements: [
      FAQ.one('faq-head', { base: 12.5, size: pt(40), role: 'title' }, say('GOOD TO KNOW')),
    ],
  },
  {
    key: 'social', label: { en: 'Share the joy' }, sections: ['social'], seam: 0, drawn: true,
    ground: ground('social', 0.5556),
    elements: [
      SOCIAL.one('social-head', { base: 34.432, size: pt(30), cx: 50.10 }, { word: 'title:social' }, say('SHARE THE JOY')),
      // `body`, not `title`: a title on a paged design is uppercase and tracked
      // 0.34em, which turned her hashtag into spaced capitals off both edges.
      // A hashtag is written the way the family wrote it.
      SOCIAL.one('social-tag', { base: 67.279, size: pt(50), cx: 49.64, w: 86, room: 26 }, bind('social', 'hashtag')),
    ],
  },
  {
    key: 'assistance', label: { en: 'Questions?' }, sections: ['contact'], seam: 0, drawn: true,
    ground: ground('assistance', 0.5556),
    elements: [
      HELP.one('help-head', { base: 27.079, size: pt(40), face: 'display', weight: 700 }, { word: 'title:contact' }, say('QUESTIONS?')),
      HELP.many('help-one', { base: 57.599, size: pt(25), cx: 36.12, w: 26, lead: 1.18 },
        [[bind('contact', 'name')], [bind('contact', 'phone')]]),
      HELP.many('help-two', { base: 57.254, size: pt(25), cx: 65.97, w: 26, lead: 1.18, hide: true },
        [[bind('contact', 'name2')], [bind('contact', 'phone2')]]),
      HELP.one('help-note', { base: 78.221, size: pt(25), cx: 50.95 },
        bind('contact', 'chatNote'), { word: 'contactNote' }, say('Or message us on Messenger.')),
    ],
  },
  {
    key: 'closing', label: { en: 'See you there' }, sections: ['closing'], seam: 0, drawn: true,
    ground: ground('closing', 0.463),
    elements: [
      CLOSE.one('close-head', { base: 24.461, size: pt(27.5), face: 'display', weight: 700 }, { word: 'closing' }, say('SEE YOU THERE!')),
      CLOSE.one('close-msg', { base: 36.979, size: pt(20), w: 58, lead: 1.5 },
        bind('closing', 'message'), { word: 'closingMessage' }),
      CLOSE.one('close-sign', { base: 55.743, size: pt(24.62), room: 40 }, bind('closing', 'signature')),
      // hers read "LUCAS ANDREI'S CHRISTENING"; the nearest thing an
      // invitation actually holds is the child's own name, so that is the line
      CLOSE.one('close-what', { base: 64.753, size: pt(20), w: 70, hide: true, room: 40, caps: true }, bind('cover', 'childFull', { show: 'given' })),
      CLOSE.one('close-when', { base: 72.153, size: pt(20) }, bind('cover', 'date', { show: 'dateShort' })),
      CLOSE.one('close-tag', { base: 80.771, size: pt(20), hide: true }, bind('social', 'hashtag')),
    ],
  },

  // ───────────────────── behind the oval: Our Story ─────────────────────
  {
    key: 'our-story', label: { en: 'Our Story' }, sections: ['story'], seam: 0, booklet: 'story', drawn: true,
    ground: ground('our-story', 1.7778),
    elements: [
      // white, both of them: they are written over her blue banner
      STORY.one('story-head', { base: 14.961, size: 12.43, color: 'surface', face: 'names', role: 'script', cx: 49.75, w: 84 },
        { word: 'title:story' }, say('Our Story')),
      STORY.one('story-line', { base: 18.267, size: pt(30), color: 'surface', face: 'display', weight: 700, cx: 50.22, w: 64, room: 46, mark: 'accent' },
        bind('story', 'line'), { word: 'story' }),
      /*
       * Her four milestones, hung off the drawn spine: the words on one side
       * of it, a photograph on the other.
       *
       * The date is hers and it is back — it was dropped in the first build
       * and it is the line the row hangs on. Three lines, three baselines:
       * she set the date 2.63 under nothing, the title 2.63 under the date
       * and the sentence 2.98 under the title, and three boxes is the only
       * way to keep three different gaps.
       *
       * The photographs are ours rather than hers — she drew the spine and
       * its four dots and left both sides of it empty, and asked for frames
       * afterwards. `story.timeline[].photo` already existed on the form;
       * the question was being asked and nothing was drawing the answer.
       */
      ...ROWS(STORY, 'story', 'story', 'timeline', 'date', [
        { left: 6.10, date: 36.899, title: 39.524, text: 42.499 },
        { left: 59.84, date: 51.231, title: 53.856, text: 56.831 },
        { left: 6.10, date: 66.040, title: 68.665, text: 71.640 },
        { left: 59.84, date: 80.873, title: 83.498, text: 86.473 },
      ]),
      // on the middle of its own row — halfway between her date's baseline
      // and her sentence's — rather than under it, so the picture and the
      // words read as one moment
      ...[
        { i: 0, y: 39.7, left: true }, { i: 1, y: 54.0, left: false },
        { i: 2, y: 68.8, left: true }, { i: 3, y: 83.7, left: false },
      ].map(({ i, y, left }): PhotoEl => ({
        id: `story-photo-${i + 1}`, kind: 'photo',
        x: left ? 72 : 26, y, w: 26, aspect: 1, anchor: 'centre',
        rotate: left ? 2.5 : -2.5, frame: 'thin',
        bind: { section: 'story', field: 'timeline', index: i, sub: 'photo' },
        alt: { section: 'story', field: 'timeline', index: i, sub: 'title' },
      })),
    ],
  },
  {
    key: 'gallery', label: { en: 'Baby photos' }, sections: ['gallery'], seam: 0, booklet: 'story', drawn: true,
    ground: ground('gallery', 1.7778),
    elements: [
      /*
       * Her two asides, in the gutters her frames leave.
       *
       * Both are Abhaya Libre in her file, not a script, and both are set
       * 1.05 of their size apart — tight, and the reason they read as one
       * hand-written aside rather than a paragraph.
       *
       * The boxes are the width she drew and no wider. That is not fussiness:
       * her polaroids stand from 30% to 68% of the page, so a box any wider
       * than the gutter beside them puts the words *on* the frames. The left
       * one starts at her 7.52 and is 17.5 across, the right one ends at her
       * 90.0 and is 12 across. Both are her own edges; the widths are the
       * substitute face's rather than hers, set so the lines break where she
       * broke them — "Mom and / Dad love / you!" and "You are / our /
       * greatest / blessing!" — because Abhaya Libre sets wider than the face
       * she used and her exact widths took an extra line. Widen either past
       * the gutter and the words climb onto the frames.
       */
      GALLERY.one('gallery-left', { base: 39.843, size: pt(35), color: 'accent', cx: 16.27, w: 17.5, align: 'left', lead: 1.05, room: 26 },
        bind('gallery', 'note'), { word: 'galleryNote' }, say('Mom and Dad love you!')),
      GALLERY.one('gallery-right', { base: 56.523, size: pt(30), color: 'accent', cx: 84.0, w: 12.0, align: 'right', lead: 1.05, room: 32 },
        bind('gallery', 'close'), { word: 'galleryClose' }, say('You are our greatest blessing!')),
      /*
       * Three photographs, in the windows of her three polaroids.
       *
       * Canva leaves a photo *placeholder* in a frame — one landscape image
       * placed three times and clipped — and it is baked into the export like
       * any other picture. It came off with the words (`drops.json`), because
       * a family's baby photos page carrying Canva's green hills is worse than
       * one carrying nothing. The windows are measured off the cleaned ground
       * rather than guessed: the gap between each frame's top border and its
       * foot, and between its two sides.
       *
       * `cover`, so a portrait from a phone fills the square instead of
       * sitting letterboxed in it, and no frame of our own — her polaroid is
       * the frame.
       */
      // `aspect` is the window's height over its width, which is what the
      // slot takes — 350 by 366 pixels on her 1080-wide page, near enough
      // square and not quite
      ...[
        { cx: 48.89, cy: 19.22, aspect: 0.9563 },
        { cx: 48.89, cy: 48.46, aspect: 0.9590 },
        { cx: 48.43, cy: 77.45, aspect: 0.9563 },
      ].map(({ cx, cy, aspect }, i): PhotoEl => ({
        id: `gallery-photo-${i + 1}`, kind: 'photo',
        x: cx, y: cy, w: 33.89, aspect, anchor: 'centre', frame: 'none',
        bind: { section: 'gallery', field: 'photos', index: i, sub: 'url' },
        alt: { section: 'gallery', field: 'photos', index: i, sub: 'caption' },
      })),
    ],
  },

  // ─────────────────── behind the envelope: The Details ───────────────────
  {
    // it carries the parents too — their names are drawn on it under
    // P A R E N T S — so the section is claimed here and the app does not
    // add a page of its own for a part this design already shows
    key: 'invitation', label: { en: 'The Invitation' }, sections: ['ceremony', 'parents'], seam: 0, booklet: 'details', drawn: true,
    ground: ground('invitation', 1.7778),
    elements: [
      // she typed no spaces in this one — she let Canva track it — so the role
      // does the tracking and the word stays a word
      INVITE.one('inv-head', { base: 21.106, size: pt(50), role: 'title', cx: 50.22 }, { word: 'title:invitation' }, say('CEREMONY')),
      INVITE.one('inv-line', { base: 26.506, size: pt(35), cx: 50.16, w: 68, lead: 1.39 },
        { word: 'invitation' }, say('Join us as we welcome our little one into God’s family')),
      INVITE.one('inv-name', { base: 38.356, size: 10.32, face: 'names', role: 'script', cx: 50.84, w: 88, room: 17 },
        bind('cover', 'childFull', { show: 'given' })),
      INVITE.one('inv-family', { base: 40.562, size: pt(25), face: 'display', weight: 700, cx: 49.93, room: 28, caps: true },
        bind('parents', 'familyName')),
      INVITE.one('inv-parents', { base: 46.815, size: pt(30), face: 'display', weight: 700, cx: 50.16 }, say('P A R E N T S')),
      INVITE.one('inv-dad', { base: 49.266, size: pt(25), cx: 29.90, w: 28 }, bind('parents', 'father')),
      INVITE.one('inv-mum', { base: 49.333, size: pt(25), cx: 70.41, w: 28 }, bind('parents', 'mother')),
      // four rows beside her drawn icons, all off the same left edge, each a
      // bold line over a lighter one at the gap she set between them
      INVITE.mixed('inv-day', { base: 54.439, size: pt(25), cx: 57, w: 46, align: 'left', lead: 1.39, face: 'display', weight: 700, caps: true }, [
        { src: [bind('ceremony', 'date', { show: 'weekday' })] },
        { size: pt(20), weight: 400, src: [bind('ceremony', 'date', { show: 'date' })] },
      ]),
      INVITE.mixed('inv-time', { base: 60.257, size: pt(25), cx: 57, w: 46, align: 'left', lead: 1.23, face: 'display', weight: 700, caps: true }, [
        { src: [bind('ceremony', 'time', { show: 'time' })] },
        { size: pt(20), weight: 400, src: [say('CEREMONY')] },
      ]),
      INVITE.mixed('inv-where', { base: 66.090, size: pt(25), cx: 57, w: 46, align: 'left', lead: 1.15, face: 'display', weight: 700, caps: true }, [
        { src: [bind('ceremony', 'venue')] },
        { size: pt(20), weight: 400, src: [bind('ceremony', 'address')] },
      ]),
      INVITE.one('inv-wear', { base: 74.183, size: pt(25), cx: 57, w: 46, align: 'left', face: 'display', weight: 700, caps: true },
        bind('dressCode', 'attireText'), { word: 'dressCode' }, say('SMART CASUAL')),
      INVITE.one('inv-note', { base: 79.794, size: pt(18.69), cx: 50.16, w: 56, lead: 1.33, hide: true },
        bind('ceremony', 'note')),
      // she drew the button; `link` makes it one. See LinkEl for what the
      // calendar file is built out of.
      INVITE.one('inv-cal', { base: 91.897, size: pt(20), face: 'display', weight: 700, cx: 49.66, w: 72, button: true, go: { to: 'calendar' } },
        say('ADD TO CALENDAR')),
    ],
  },
  {
    key: 'godparents', label: { en: 'Ninongs & Ninangs' }, sections: ['sponsors'], seam: 0, booklet: 'details', drawn: true, grow: true,
    ground: ground('godparents', 1.1111),
    elements: [
      GODPARENTS.one('gp-head', { base: 23.442, size: pt(46.83), color: 'accent', role: 'title', cx: 50.20, face: 'display' },
        { word: 'title:sponsors' }, say('GODPARENTS')),
      GODPARENTS.one('gp-ninongs-head', { base: 32.722, size: pt(32.78), color: 'muted', cx: 27.43, w: 30 }, say('NINONGS')),
      GODPARENTS.one('gp-ninangs-head', { base: 32.916, size: pt(32.78), color: 'muted', cx: 72.44, w: 30 }, say('NINANGS')),
      // one box a column, not one a name: she drew nine rows and a customer
      // may bring three or twelve, so the list sets itself and the page grows
      // at the 1.32 leading she put between her rows
      GODPARENTS.one('gp-ninongs', { base: 37.052, size: pt(28.10), cx: 27.35, w: 30, lead: 1.32 },
        bind('sponsors', 'ninongs', { sub: 'name' })),
      GODPARENTS.one('gp-ninangs', { base: 37.052, size: pt(28.10), cx: 71.67, w: 30, lead: 1.32 },
        bind('sponsors', 'ninangs', { sub: 'name' })),
    ],
  },
  {
    key: 'venue', label: { en: 'The Venue' }, sections: ['reception'], seam: 0, booklet: 'details', drawn: true,
    ground: ground('venue', 1.2963),
    elements: [
      VENUE.one('venue-cer-head', { base: 18.064, size: pt(40), color: 'muted', role: 'title', cx: 50.05 }, say('CEREMONY')),
      VENUE.one('venue-cer-name', { base: 24.176, size: pt(30), color: 'accent', face: 'display', weight: 700, w: 56, lead: 1.2, room: 44, caps: true, mark: 'surface' },
        bind('ceremony', 'venue')),
      VENUE.mixed('venue-cer-where', { base: 32.138, size: pt(25), color: 'accent', cx: 50.15, w: 76, lead: 1.13 }, [
        { src: [bind('ceremony', 'address')] },
        { src: [bind('ceremony', 'time', { show: 'time' })] },
      ]),
      VENUE.one('venue-cer-maps', { base: 39.0, size: pt(19), face: 'display', weight: 700, cx: 50, w: 72, button: true, go: { to: 'maps', of: 'ceremony' } },
        say('OPEN IN GOOGLE MAPS')),
      VENUE.one('venue-cer-waze', { base: 45.2, size: pt(19), face: 'display', weight: 700, cx: 50, w: 72, button: true, go: { to: 'waze', of: 'ceremony' } },
        say('OPEN IN WAZE')),
      VENUE.one('venue-rec-head', { base: 61.622, size: pt(40), color: 'muted', role: 'title', cx: 50.01 },
        { word: 'title:venue' }, say('RECEPTION')),
      VENUE.one('venue-rec-name', { base: 67.511, size: pt(30), color: 'accent', face: 'display', weight: 700, w: 56, lead: 1.2, room: 44, caps: true, mark: 'surface' },
        bind('reception', 'venue')),
      VENUE.mixed('venue-rec-where', { base: 72.746, size: pt(25), color: 'accent', cx: 50.15, w: 76, lead: 1.02 }, [
        { src: [bind('reception', 'address')] },
        { src: [bind('reception', 'time', { show: 'time' })] },
      ]),
      VENUE.one('venue-rec-maps', { base: 82.4, size: pt(19), face: 'display', weight: 700, cx: 50, w: 72, button: true, go: { to: 'maps', of: 'reception' } },
        say('OPEN IN GOOGLE MAPS')),
      VENUE.one('venue-rec-waze', { base: 88.6, size: pt(19), face: 'display', weight: 700, cx: 50, w: 72, button: true, go: { to: 'waze', of: 'reception' } },
        say('OPEN IN WAZE')),
    ],
  },
  /**
   * The dress code page she left blank, filled from the sheet she approved:
   * a heading, the attire, and her palette note under the drawn swatches.
   */
  {
    /*
     * Her page is a white card and nothing else — she drew the frame and
     * left the inside for us. So the heading is hers and the rest is the
     * section's own: the figures in the colours the family picked, the
     * palette with each shade named, and the kindly-avoid list drawn
     * crossed out. `live` is what lets a drawn page carry them (see
     * PageSpec.live); they cannot be placed by hand because how many
     * colours and how many things to avoid is the family's answer.
     */
    key: 'dresscode', label: { en: 'Dress Code' }, sections: ['dressCode'], seam: 0, booklet: 'details',
    drawn: true, grow: true, live: true, headPad: 26,
    ground: ground('dresscode', 1.7778, true),
    elements: [
      // the heading is hers; the line under it is the section's, written from
      // the attire the family ticked — two of them was one of them wrong
      DRESS.one('dress-head', { base: 11.5, size: pt(46), role: 'title' }, { word: 'title:dressCode' }, say('DRESS CODE')),
    ],
  },
  {
    key: 'program', label: { en: 'Program' }, sections: ['program'], seam: 0, booklet: 'details', drawn: true,
    ground: ground('program', 1.4815),
    elements: [
      PROGRAM.one('prog-head', { base: 10.375, size: 9.89, face: 'script', role: 'script', w: 62 },
        { word: 'title:program' }, say('Program')),
      // her five slots, left and right in turn down the drawn spine
      ...ROWS(PROGRAM, 'prog', 'program', 'items', 'time', [
        { left: 10.72, date: 17.438, title: 20.589, text: 24.159 },
        { left: 57.52, date: 33.538, title: 36.689, text: 40.259 },
        { left: 10.25, date: 49.529, title: 52.680, text: 56.249 },
        { left: 57.52, date: 65.519, title: 68.670, text: 72.240 },
        { left: 10.72, date: 81.510, title: 84.661, text: 88.231 },
      ]),
    ],
  },
  {
    key: 'gift-note', label: { en: 'Gift Note' }, sections: ['gift'], seam: 0, booklet: 'details', drawn: true,
    ground: ground('gift-note', 1.1111),
    elements: [
      GIFT.one('gift-head', { base: 14.052, size: pt(53.8), role: 'title', cx: 50.45 }, { word: 'title:gift' }, say('GIFT NOTE')),
      GIFT.one('gift-words', { base: 31.505, size: pt(32.28), w: 74, lead: 1.15 },
        bind('gift', 'text'), { word: 'giftThanks' }),
      /*
       * One block for both ways of sending a gift.
       *
       * She asked for a bank account as an alternative to the GCash QR, with
       * the QR gone when they pick it. A drawn page has no conditionals, and
       * it does not need any: a line shows the first of its sources that has
       * something in it, so the account name falls back to the GCash name
       * and the account number to the GCash number. A family who filled in
       * one sees one. The bank's own line sits between them and disappears
       * when there is no bank.
       *
       * The heading says which: her own SEND A GIFT VIA GCASH where there is
       * a QR to scan, and SEND A GIFT where there is an account to type. The
       * QR itself is drawn by the section, and the section is what knows
       * which way they picked.
       */
      GIFT.one('gift-pay', { base: 52.833, size: pt(30), face: 'display', weight: 700 },
        say('SEND A GIFT')),
      /*
       * Two layouts of one page, and the answer that picks between them.
       *
       * A family who sends a QR gets the QR where she drew one, with their
       * name and number under it at her baselines. A family who sends a bank
       * account gets the three lines *in the QR's place* — because a square
       * of empty artwork with the account printed below it is a hole in the
       * page, and it is what she asked to have gone.
       *
       * The QR itself is the family's own upload now, not her placeholder:
       * that came out of the ground with the words (`drops.json`), so a page
       * with nothing to scan has nothing drawn on it.
       */
      { id: 'gift-qr', kind: 'photo', bind: { section: 'gift', field: 'gcashQr' },
        x: 49.95, y: 68.08, w: 27.31, aspect: 1, anchor: 'centre',
        when: { section: 'gift', field: 'payBy', is: QR_WAY } },
      ...([
        // under her QR, where she drew them
        { at: 'gcash' as const, who: 86.224, bank: 90.863, no: 94.9 },
        // in the QR's own place, where there is no QR to sit under
        { at: 'bank' as const, who: 63.5, bank: 69.4, no: 75.3 },
      ].flatMap(({ at, who, bank, no }) => {
        const when = { section: 'gift', field: 'payBy', is: at === 'gcash' ? QR_WAY : BANK_WAY };
        return [
          GIFT.one(`gift-${at}-who`, { base: who, size: pt(35), hide: true, room: 40, when },
            bind('gift', 'bankAccountName'), bind('gift', 'gcashName')),
          GIFT.one(`gift-${at}-bank`, { base: bank, size: pt(30), hide: true, room: 40, when },
            bind('gift', 'bankName')),
          GIFT.one(`gift-${at}-no`, { base: no, size: pt(35), hide: true, room: 34, when },
            bind('gift', 'bankAccountNumber'), bind('gift', 'gcashNumber')),
        ];
      })),
    ],
  },

  // ──────────────── behind the sealed envelope: the RSVP ────────────────
  {
    key: 'rsvp', label: { en: 'RSVP' }, sections: ['rsvp'], seam: 0, booklet: 'rsvp', drawn: true, grow: true, live: true, headPad: 30,
    ground: ground('rsvp', 1.7778, true),
    elements: [
      // four letters on an arc, each turned its own way, because that is how
      // she set them and a box of words cannot bend. The word is the same in
      // both languages, which is the only reason four fixed letters are safe.
      RSVP.one('rsvp-r', { base: 13.231, size: pt(100), color: 'surface', face: 'display', weight: 700, cx: 34.14, w: 16, turn: 11.5 }, say('R')),
      RSVP.one('rsvp-s', { base: 13.920, size: pt(100), color: 'surface', face: 'display', weight: 700, cx: 44.83, w: 16, turn: 3.7 }, say('S')),
      RSVP.one('rsvp-v', { base: 13.868, size: pt(100), color: 'surface', face: 'display', weight: 700, cx: 55.48, w: 16, turn: -4.0 }, say('V')),
      RSVP.one('rsvp-p', { base: 12.854, size: pt(100), color: 'surface', face: 'display', weight: 700, cx: 66.09, w: 16, turn: -11.8 }, say('P')),
      // her line and her date are not drawn here: the section writes them
      // itself, just under the banner, because it is the section that knows
      // how many seats a guest was given and whether the date has passed.
      // Two copies of one sentence is one of them wrong.
    ],
  },
];

/**
 * The column's colour and the surround's, both sampled off her own ground
 * rather than picked: the fill behind the clouds, and the same a shade deeper
 * so the column has an edge on a laptop.
 */
export const CHRISTENING_PAPER = '#e7f3ff';
export const CHRISTENING_SURROUND = '#d9e9f8';
