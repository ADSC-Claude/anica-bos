import type { Element, FieldRef, Ground, Line, PageSpec, ShapeEl, Source, TextEl } from './design';

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
 * Nothing here is eyeballed. Every place is read off the PDF she exported:
 * `y` is the top of her line over the page's height, `x` the middle of it
 * over the width, both as percentages because that is what `elementStyle`
 * writes into `top` and `left`. Setting `x` always centres the element on it
 * — the style function adds `translateX(-50%)` whenever x is present — so a
 * box is placed by its middle and given a width, never by its left edge.
 *
 * Sizes are her point size over the page's 810pt width, times 100, because
 * `Line.size` is in cqw and cqw is one hundredth of the column. So 80pt on
 * her cover is 80/8.1 = 9.88.
 *
 * Two places where the arithmetic is not the whole answer, both deliberate:
 *
 * - **The faces are not her faces.** Westonia and Loubag are licensed to
 *   Canva; Allura and Jost Semibold stand in for them, and Parisienne for TT
 *   Nooks Script. Two faces at one point size do not cover the same width, so
 *   a few sizes are nudged off the arithmetic to hold her line breaks. Every
 *   one that is nudged says so where it sits.
 * - **A box says which face it is set in.** `face` is not decoration: a box
 *   that names none is set in the body serif, so the first build came out
 *   with the baby's name, "Our Story" and the programme's times all in
 *   Abhaya Libre, and none of the design's character reached the page.
 *   Every box here names one — `names` for Parisienne, `script` for Allura,
 *   `display` and `body` for Abhaya Libre.
 * - **The role does the tracking, so the words do not.** On a paged design
 *   `.inv-title` is uppercase with 0.34em of letter-spacing. Her headings
 *   are letter-spaced caps, so that is right — but she typed the spaces in
 *   as well ("G O D P A R E N T S"), and the two together doubled it off the
 *   page. The plain word, tracked once by the role, is what she drew.
 *
 *   The same rule is what ruined the baby's name: `title` on a script face
 *   set "Lucas Andrei Villanueva" in tracked capitals, 855px of it in a
 *   359px box. A script line is `role: 'script'`, which is the one that
 *   leaves the letters alone.
 * - **A name is capped, not shrunk.** Hers is "Lucas Andrei", twelve
 *   letters, and the cover was drawn for twelve. Nothing scales type down to
 *   fit, so at her 100pt a 23-letter name wrapped to seven lines and buried
 *   the page. The sizes below hold about twenty letters — measured in
 *   Parisienne with the real face loaded, not guessed — and `room` is what
 *   tells the form to stop there, so the cap is something a customer meets
 *   at the box rather than discovers on their own cover.
 *
 *   Measured with the real face loaded and the roles right: Parisienne on
 *   one line holds 12 letters at 14cqw, 17 at 12.5, 23 at 9.25. Her own
 *   100pt is 12.35cqw, so her page is drawn for about seventeen — which is
 *   the cap, and the size stays hers rather than being shrunk to fit a demo
 *   name longer than the one she drew for.
 * - **Her page is fixed and ours grows.** She drew four milestones and nine
 *   godparents; a customer may have two or twelve. A list is placed by its
 *   first line and left to grow downward, which is why the godparents'
 *   columns carry a width and no height.
 */

/** cqw from her point size on an 810pt-wide page: one hundredth of the column. */
const pt = (n: number) => Math.round((n / 8.1) * 100) / 100;

const ground = (slug: string, ratio: number): Ground => ({
  url: `/christening/${slug}.webp`,
  ratio,
  // the fill behind her clouds, sampled off the ground rather than chosen, so
  // a page taller than its picture carries the same blue past both edges
  top: '#e7f3ff',
  bottom: '#e7f3ff',
});

/**
 * A box of words centred on the page.
 *
 * Centred is the design's default and nearly its only alignment: fifteen of
 * the sixteen pages are symmetrical about the middle. The box is given most
 * of the width rather than the width of her own words, so a longer name than
 * "Lucas Andrei" stays centred instead of running off the edge she measured.
 */
const mid = (id: string, y: number, lines: Line[], extra: Partial<TextEl> = {}): TextEl => ({
  id, kind: 'text', block: 'free', x: 50, y, w: 88, anchor: 'top', face: 'body',
  ...extra,
  lines: lines.map((l) => ({ align: 'center' as const, ...l })),
});

/**
 * A box of words in a column of its own, placed by the column's middle.
 *
 * Four pages are built in columns rather than down the middle — the story's
 * milestones, the programme's slots, the two rows of godparents, the pair of
 * contacts — and each column is given here as its left edge and width, which
 * is how a page is measured, then turned into the middle, which is how the
 * document places things.
 */
const col = (id: string, left: number, y: number, w: number, lines: Line[], extra: Partial<TextEl> = {}): TextEl => ({
  id, kind: 'text', block: 'free', x: left + w / 2, y, w, anchor: 'top', face: 'body',
  ...extra,
  lines,
});

const say = (s: string): Source => ({ fixed: { en: s } });
const bind = (section: string, field: string, rest: Omit<FieldRef, 'section' | 'field'> = {}): Source => ({ bind: { section, field, ...rest } });

/**
 * The thing a guest taps to open a booklet, and the words under it.
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
 * live one flickers and a drawn one cannot — and a drawn underline beneath a
 * live one is two underlines.
 */
const opener = (
  id: string,
  opens: string,
  box: { x: number; y: number; w: number; h: number },
  caption: { x: number; y: number; w: number },
): Element[] => {
  const target: ShapeEl = {
    id, kind: 'shape', shape: 'rect',
    x: box.x + box.w / 2, y: box.y + box.h / 2, w: box.w, h: box.h,
    anchor: 'centre', fill: 'transparent', opens,
  };
  return [
    target,
    mid(`${id}-say`, caption.y, [{ role: 'caption', sources: [say('CLICK HERE')], size: pt(25), color: 'muted' }], {
      x: caption.x, w: caption.w,
    }),
  ];
};

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
    key: 'cover', label: { en: 'Cover' }, sections: ['cover'], drawn: true,
    ground: ground('cover', 1.7778),
    elements: [
      mid('cover-the', 15.9, [{ role: 'eyebrow', sources: [say('The')], size: pt(35), color: 'accent' }]),
      // her word in her script. Parisienne sets narrower than TT Nooks, so 86 where she had 80.
      mid('cover-word', 17.6, [{ role: 'script', sources: [{ word: 'cover' }, say('Christening')], size: pt(78), color: 'ink' }], { face: 'names', w: 92 }),
      mid('cover-of', 25.5, [{ role: 'eyebrow', sources: [say('of our son')], size: pt(30), color: 'accent' }]),
      mid('cover-name', 36.8, [{ role: 'script', sources: [bind('cover', 'childFull')], size: pt(100), color: 'accent' }], { face: 'names', w: 92, room: 17 }),
      mid('cover-family', 45.9, [{ role: 'sub', sources: [bind('parents', 'familyName')], size: pt(34), color: 'accent' }], { room: 28 }),
      mid('cover-date', 58.8, [
        { role: 'body', sources: [bind('cover', 'date', { show: 'date' })], size: pt(35), color: 'accent' },
        { role: 'body', sources: [bind('cover', 'time', { show: 'time' })], size: pt(35), color: 'accent' },
      ]),
      mid('cover-church', 64.6, [{ role: 'body', sources: [bind('ceremony', 'venue')], size: pt(30), color: 'accent' }]),
    ],
  },
  {
    key: 'countdown', label: { en: 'Countdown' }, sections: ['countdown'], drawn: true,
    ground: ground('countdown', 0.3241),
    elements: [
      mid('countdown-line', 63, [{ role: 'script', sources: [bind('countdown', 'label'), { word: 'countdown' }, say('before the big day')], size: pt(34), color: 'accent' }], { face: 'script', room: 34 }),
    ],
  },
  /**
   * The hub. It carries no section of its own, because everything on it is a
   * door rather than a part of the invitation.
   *
   * `peekEnd` stops the shop's preview here, which is the right place for it:
   * the hub is the whole idea of the design in one screen, and the nine pages
   * behind it are the thing being bought.
   */
  {
    key: 'highlights', label: { en: 'Highlights' }, sections: [], drawn: true, peekEnd: true,
    ground: ground('highlights', 1.7778),
    elements: [
      mid('hl-details', 16.6, [{ role: 'eyebrow', sources: [say('The Details')], size: pt(20), color: 'ink' }], { x: 39, w: 62 }),
      mid('hl-of', 19.2, [{ role: 'eyebrow', sources: [say('The Christening of')], size: pt(23), color: 'ink' }], { x: 39, w: 62 }),
      mid('hl-name', 20.2, [{ role: 'script', sources: [bind('cover', 'childFull')], size: pt(40), color: 'accent' }], { x: 39, w: 62, face: 'names' }),
      // her "10 · 28 · 2028" has no match among the four formats; the short
      // one ("Oct 28, 2028") is the nearest and is what the page now says
      mid('hl-date', 25.2, [{ role: 'body', sources: [bind('cover', 'date', { show: 'dateShort' })], size: pt(23), color: 'ink' }], { x: 39, w: 62 }),
      ...opener('hl-open-details', 'details', { x: 8, y: 8, w: 62, h: 26 }, { x: 43, y: 35.8, w: 42 }),
      mid('hl-story', 57.5, [{ role: 'script', sources: [say('Our Story')], size: pt(66), color: 'ink' }], { x: 40, w: 44, face: 'script' }),
      ...opener('hl-open-story', 'story', { x: 18, y: 44, w: 44, h: 26 }, { x: 41, y: 68.8, w: 42 }),
      mid('hl-kindly', 47.3, [{ role: 'eyebrow', sources: [say('Kindly')], size: pt(25), color: 'ink' }], { x: 70, w: 28 }),
      mid('hl-rsvp', 48.8, [{ role: 'label-title', sources: [say('RSVP')], size: pt(31), color: 'ink' }], { x: 70, w: 28, face: 'display', weight: 700 }),
      ...opener('hl-open-rsvp', 'rsvp', { x: 54, y: 42, w: 34, h: 18 }, { x: 66, y: 58.3, w: 34 }),
    ],
  },
  /**
   * The FAQ page she left blank. It grows, because a customer may write three
   * questions or ten, and the section draws the pairs itself.
   */
  {
    key: 'faq', label: { en: 'Good to know' }, sections: ['faq'], drawn: true, grow: true,
    ground: ground('faq', 1.1111),
    elements: [
      mid('faq-head', 8, [{ role: 'title', sources: [say('GOOD TO KNOW')], size: pt(40), color: 'ink' }]),
    ],
  },
  {
    key: 'social', label: { en: 'Share the joy' }, sections: ['social'], drawn: true,
    ground: ground('social', 0.5556),
    elements: [
      mid('social-head', 28.8, [{ role: 'eyebrow', sources: [{ word: 'title:social' }, say('SHARE THE JOY')], size: pt(30), color: 'ink' }]),
      // `body`, not `title`: a title on a paged design is uppercase and tracked
      // 0.34em, which turned her hashtag into spaced capitals off both edges.
      // A hashtag is written the way the family wrote it.
      mid('social-tag', 56.4, [{ role: 'body', sources: [bind('social', 'hashtag')], size: pt(46), color: 'ink' }], { w: 86, room: 26 }),
    ],
  },
  {
    key: 'assistance', label: { en: 'Questions?' }, sections: ['contact'], drawn: true,
    ground: ground('assistance', 0.5556),
    elements: [
      mid('help-head', 19.6, [{ role: 'title', sources: [{ word: 'title:contact' }, say('QUESTIONS?')], size: pt(40), color: 'ink' }]),
      col('help-one', 24, 52.9, 26, [
        { role: 'body', sources: [bind('contact', 'name')], size: pt(25), color: 'ink', align: 'center' },
        { role: 'body', sources: [bind('contact', 'phone')], size: pt(25), color: 'ink', align: 'center' },
      ]),
      col('help-two', 54, 52.6, 26, [
        { role: 'body', sources: [bind('contact', 'name2')], size: pt(25), color: 'ink', align: 'center' },
        { role: 'body', sources: [bind('contact', 'phone2')], size: pt(25), color: 'ink', align: 'center' },
      ], { hidden: 'whenEmpty' }),
      mid('help-note', 73.6, [{ role: 'body', sources: [bind('contact', 'chatNote'), { word: 'contactNote' }, say('Or message us on Messenger.')], size: pt(25), color: 'ink' }]),
    ],
  },
  {
    key: 'closing', label: { en: 'See you there' }, sections: ['closing'], drawn: true,
    ground: ground('closing', 0.463),
    elements: [
      mid('close-head', 18.3, [{ role: 'title', sources: [{ word: 'closing' }, say('SEE YOU THERE!')], size: pt(27.5), color: 'ink' }]),
      mid('close-msg', 32.5, [{ role: 'body', sources: [bind('closing', 'line'), { word: 'closingMessage' }], size: pt(20), color: 'ink' }], { w: 56 }),
      mid('close-sign', 49.4, [{ role: 'script', sources: [bind('closing', 'signature')], size: pt(30), color: 'ink' }], { face: 'script', room: 40 }),
      mid('close-when', 67.7, [{ role: 'caption', sources: [bind('cover', 'date', { show: 'dateShort' })], size: pt(20), color: 'ink' }]),
      mid('close-tag', 76.3, [{ role: 'caption', sources: [bind('social', 'hashtag')], size: pt(20), color: 'ink' }], { hidden: 'whenEmpty' }),
    ],
  },

  // ───────────────────── behind the oval: Our Story ─────────────────────
  {
    key: 'our-story', label: { en: 'Our Story' }, sections: ['story'], booklet: 'story', drawn: true,
    ground: ground('our-story', 1.7778),
    elements: [
      mid('story-head', 6.4, [{ role: 'script', sources: [{ word: 'title:story' }, say('Our Story')], size: pt(108), color: 'ink' }], { face: 'script', w: 84 }),
      mid('story-line', 17.4, [{ role: 'sub', sources: [bind('story', 'line'), { word: 'story' }], size: pt(26), color: 'ink' }], { w: 62, room: 46 }),
      /*
       * Her four milestones, hung off the drawn spine: the words on one side
       * of it, a photograph on the other.
       *
       * The photographs are ours rather than hers — she drew the spine and
       * its four dots and left both sides of it empty, and asked for frames
       * afterwards. The side alternates with the words so the page reads
       * down the spine rather than down one margin, and each pair is placed
       * on its own dot: the words by their top, the picture on its middle,
       * so a long description grows downward without dragging the frame
       * with it.
       *
       * `story.timeline[].photo` already existed on the form — the question
       * was being asked and nothing was drawing the answer.
       */
      ...[
        { i: 0, y: 35.5, left: true }, { i: 1, y: 49.8, left: false },
        { i: 2, y: 64.6, left: true }, { i: 3, y: 79.5, left: false },
      ].flatMap(({ i, y, left }) => [
        col(`story-note-${i + 1}`, left ? 6 : 59.8, y, 32, [
          { role: 'script', sources: [bind('story', 'timeline', { index: i, sub: 'date' })], size: pt(30), color: 'ink' },
          { role: 'label-title', sources: [bind('story', 'timeline', { index: i, sub: 'title' })], size: pt(24), color: 'ink' },
          { role: 'label-text', sources: [bind('story', 'timeline', { index: i, sub: 'text' })], size: pt(17), color: 'ink' },
        ], { hidden: 'whenEmpty' }),
        {
          id: `story-photo-${i + 1}`, kind: 'photo' as const,
          x: left ? 72 : 26, y: y + 3.2, w: 26, aspect: 1, anchor: 'centre' as const,
          rotate: left ? 2.5 : -2.5, frame: 'thin' as const,
          bind: { section: 'story', field: 'timeline', index: i, sub: 'photo' },
          alt: { section: 'story', field: 'timeline', index: i, sub: 'title' },
        },
      ]),
    ],
  },
  {
    key: 'gallery', label: { en: 'Baby photos' }, sections: ['gallery'], booklet: 'story', drawn: true,
    ground: ground('gallery', 1.7778),
    elements: [
      col('gallery-left', 6, 36.5, 26, [{ role: 'script', sources: [bind('gallery', 'note'), { word: 'galleryNote' }, say('Mom and Dad love you!')], size: pt(34), color: 'accent' }], { face: 'script', room: 34 }),
      col('gallery-right', 68, 53.5, 26, [{ role: 'script', sources: [bind('gallery', 'close'), { word: 'galleryClose' }, say('You are our greatest blessing!')], size: pt(30), color: 'accent', align: 'right' }], { face: 'script', room: 40 }),
    ],
  },

  // ─────────────────── behind the envelope: The Details ───────────────────
  {
    // it carries the parents too — their names are drawn on it under
    // P A R E N T S — so the section is claimed here and the app does not
    // add a page of its own for a part this design already shows
    key: 'invitation', label: { en: 'The Invitation' }, sections: ['ceremony', 'parents'], booklet: 'details', drawn: true,
    ground: ground('invitation', 1.7778),
    elements: [
      mid('inv-head', 18.2, [{ role: 'title', sources: [{ word: 'title:invitation' }, say('CEREMONY')], size: pt(50), color: 'ink' }]),
      mid('inv-line', 23.8, [{ role: 'sub', sources: [{ word: 'invitation' }, say('Join us as we welcome our little one into God’s family')], size: pt(28), color: 'ink' }], { w: 62 }),
      mid('inv-name', 31.4, [{ role: 'script', sources: [bind('cover', 'childFull')], size: pt(80), color: 'ink' }], { face: 'names', w: 88, room: 17 }),
      mid('inv-family', 39.6, [{ role: 'sub', sources: [bind('parents', 'familyName')], size: pt(22), color: 'ink' }]),
      mid('inv-parents', 45.1, [{ role: 'label-title', sources: [say('P A R E N T S')], size: pt(30), color: 'ink' }]),
      col('inv-dad', 18, 47.8, 26, [{ role: 'body', sources: [bind('parents', 'father')], size: pt(25), color: 'ink', align: 'center' }]),
      col('inv-mum', 56, 47.9, 26, [{ role: 'body', sources: [bind('parents', 'mother')], size: pt(25), color: 'ink', align: 'center' }]),
      // four rows beside her drawn icons, all off the same left edge
      col('inv-day', 34, 53, 46, [
        { role: 'label-title', sources: [bind('ceremony', 'date', { show: 'weekday' })], size: pt(25), color: 'ink', align: 'left' },
        { role: 'label-text', sources: [bind('ceremony', 'date', { show: 'date' })], size: pt(20), color: 'ink', align: 'left' },
      ]),
      col('inv-time', 34, 58.8, 46, [
        { role: 'label-title', sources: [bind('ceremony', 'time', { show: 'time' })], size: pt(25), color: 'ink', align: 'left' },
        { role: 'label-text', sources: [say('CEREMONY')], size: pt(20), color: 'ink', align: 'left' },
      ]),
      col('inv-where', 34, 64.6, 46, [
        { role: 'label-title', sources: [bind('ceremony', 'venue')], size: pt(25), color: 'ink', align: 'left' },
        { role: 'label-text', sources: [bind('ceremony', 'address')], size: pt(20), color: 'ink', align: 'left' },
      ]),
      col('inv-wear', 34, 72.7, 46, [{ role: 'label-title', sources: [bind('dressCode', 'attireText'), { word: 'dressCode' }, say('SMART CASUAL')], size: pt(25), color: 'ink', align: 'left' }]),
      mid('inv-note', 78.5, [{ role: 'caption', sources: [bind('ceremony', 'note')], size: pt(18.7), color: 'ink' }], { w: 56, hidden: 'whenEmpty' }),
      mid('inv-cal', 90.4, [{ role: 'label-title', sources: [say('ADD TO CALENDAR')], size: pt(25), color: 'ink' }]),
    ],
  },
  {
    key: 'godparents', label: { en: 'Ninongs & Ninangs' }, sections: ['sponsors'], booklet: 'details', drawn: true, grow: true,
    ground: ground('godparents', 1.1111),
    elements: [
      mid('gp-head', 19.1, [{ role: 'title', sources: [{ word: 'title:sponsors' }, say('GODPARENTS')], size: pt(46.8), color: 'accent' }], { w: 88, face: 'display' }),
      col('gp-ninongs-head', 14, 29.7, 26, [{ role: 'eyebrow', sources: [say('NINONGS')], size: pt(32.8), color: 'muted', align: 'center' }]),
      col('gp-ninangs-head', 59, 29.9, 26, [{ role: 'eyebrow', sources: [say('NINANGS')], size: pt(32.8), color: 'muted', align: 'center' }]),
      // one box a column, not one a name: she drew nine rows and a customer
      // may bring three or twelve, so the list sets itself and the page grows
      col('gp-ninongs', 14, 34.4, 26, [{ role: 'body', sources: [bind('sponsors', 'ninongs', { sub: 'name' })], size: pt(28.1), color: 'ink', align: 'center' }]),
      col('gp-ninangs', 59, 34.4, 26, [{ role: 'body', sources: [bind('sponsors', 'ninangs', { sub: 'name' })], size: pt(28.1), color: 'ink', align: 'center' }]),
    ],
  },
  {
    key: 'venue', label: { en: 'The Venue' }, sections: ['reception'], booklet: 'details', drawn: true,
    ground: ground('venue', 1.2963),
    elements: [
      mid('venue-cer-head', 14.9, [{ role: 'title', sources: [say('CEREMONY')], size: pt(40), color: 'muted' }]),
      mid('venue-cer-name', 21.8, [{ role: 'label-title', sources: [bind('ceremony', 'venue')], size: pt(30), color: 'accent' }]),
      mid('venue-cer-where', 29.8, [
        { role: 'body', sources: [bind('ceremony', 'address')], size: pt(25), color: 'accent' },
        { role: 'body', sources: [bind('ceremony', 'time', { show: 'time' })], size: pt(25), color: 'accent' },
      ]),
      mid('venue-rec-head', 58.4, [{ role: 'title', sources: [{ word: 'title:venue' }, say('RECEPTION')], size: pt(40), color: 'muted' }]),
      mid('venue-rec-name', 65.1, [{ role: 'label-title', sources: [bind('reception', 'venue')], size: pt(30), color: 'accent' }]),
      mid('venue-rec-where', 70.4, [
        { role: 'body', sources: [bind('reception', 'address')], size: pt(25), color: 'accent' },
        { role: 'body', sources: [bind('reception', 'time', { show: 'time' })], size: pt(25), color: 'accent' },
      ]),
    ],
  },
  /**
   * The dress code page she left blank, filled from the sheet she approved:
   * a heading, the attire, and her palette note under the drawn swatches.
   */
  {
    key: 'dresscode', label: { en: 'Dress Code' }, sections: ['dressCode'], booklet: 'details', drawn: true,
    ground: ground('dresscode', 1.7778),
    elements: [
      mid('dress-head', 8, [{ role: 'title', sources: [{ word: 'title:dressCode' }, say('DRESS CODE')], size: pt(46), color: 'ink' }]),
      mid('dress-what', 14.5, [{ role: 'label-title', sources: [bind('dressCode', 'attireText'), say('SMART CASUAL')], size: pt(30), color: 'accent' }]),
      mid('dress-note', 88, [{ role: 'caption', sources: [bind('dressCode', 'paletteNote'), { word: 'dressNote' }], size: pt(22), color: 'ink' }], { w: 70, hidden: 'whenEmpty' }),
    ],
  },
  {
    key: 'program', label: { en: 'Program' }, sections: ['program'], booklet: 'details', drawn: true,
    ground: ground('program', 1.4815),
    elements: [
      mid('prog-head', 6.2, [{ role: 'script', sources: [{ word: 'title:program' }, say('Program')], size: pt(66), color: 'ink' }], { face: 'script', w: 62 }),
      // her six slots, left and right in turn down the drawn spine
      ...[
        { i: 0, left: 10.7, y: 15.8 }, { i: 1, left: 57.5, y: 31.9 },
        { i: 2, left: 10.2, y: 47.8 }, { i: 3, left: 57.5, y: 63.8 },
        { i: 4, left: 10.7, y: 79.8 }, { i: 5, left: 57.5, y: 95.8 },
      ].map(({ i, left, y }) => col(`prog-${i + 1}`, left, y, 32, [
        { role: 'script', sources: [bind('program', 'items', { index: i, sub: 'time' })], size: pt(30), color: 'ink' },
        { role: 'label-title', sources: [bind('program', 'items', { index: i, sub: 'title' })], size: pt(24), color: 'ink' },
        { role: 'label-text', sources: [bind('program', 'items', { index: i, sub: 'note' })], size: pt(17), color: 'ink' },
      ], { hidden: 'whenEmpty' })),
    ],
  },
  {
    key: 'gift-note', label: { en: 'Gift Note' }, sections: ['gift'], booklet: 'details', drawn: true,
    ground: ground('gift-note', 1.1111),
    elements: [
      mid('gift-head', 9, [{ role: 'title', sources: [{ word: 'title:gift' }, say('GIFT NOTE')], size: pt(53.8), color: 'ink' }]),
      mid('gift-words', 28.5, [{ role: 'body', sources: [bind('gift', 'text'), { word: 'giftThanks' }], size: pt(32.3), color: 'ink' }], { w: 72 }),
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
       * The label is fixed and so always resolves, which is what keeps the
       * whole block on the page — `hidden: 'whenEmpty'` only hides a box
       * where *no* line resolved, and a fixed line always does. That is why
       * the label is inside this box and not a box of its own: on its own it
       * would sit there over nothing.
       */
      mid('gift-pay', 49.4, [{ role: 'label-title', sources: [say('SEND A GIFT')], size: pt(26), color: 'ink' }]),
      mid('gift-pay-who', 79.6, [{ role: 'body', sources: [bind('gift', 'bankAccountName'), bind('gift', 'gcashName')], size: pt(28), color: 'ink' }], { hidden: 'whenEmpty' }),
      mid('gift-pay-bank', 84.2, [{ role: 'body', sources: [bind('gift', 'bankName')], size: pt(24), color: 'ink' }], { hidden: 'whenEmpty' }),
      mid('gift-pay-no', 88.4, [{ role: 'body', sources: [bind('gift', 'bankAccountNumber'), bind('gift', 'gcashNumber')], size: pt(28), color: 'ink' }], { hidden: 'whenEmpty' }),
    ],
  },

  // ──────────────── behind the sealed envelope: the RSVP ────────────────
  {
    key: 'rsvp', label: { en: 'RSVP' }, sections: ['rsvp'], booklet: 'rsvp', drawn: true, grow: true,
    ground: ground('rsvp', 1.7778),
    elements: [
      mid('rsvp-head', 6.9, [{ role: 'title', sources: [{ word: 'title:rsvp' }, say('RSVP')], size: pt(100), color: 'ink' }]),
      mid('rsvp-line', 17.2, [{ role: 'sub', sources: [bind('rsvp', 'note'), say('Kindly confirm your attendance on or before')], size: pt(24), color: 'ink' }], { w: 62 }),
      mid('rsvp-by', 24.2, [{ role: 'label-title', sources: [bind('rsvp', 'deadline', { show: 'date' })], size: pt(26), color: 'ink' }], { hidden: 'whenEmpty', face: 'display' }),
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
