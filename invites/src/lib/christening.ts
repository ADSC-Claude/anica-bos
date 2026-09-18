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
  id, kind: 'text', block: 'free', x: 50, y, w: 88, anchor: 'top',
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
  id, kind: 'text', block: 'free', x: left + w / 2, y, w, anchor: 'top',
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
      // Parisienne sets narrower than TT Nooks, so her 80 would come up short: 86 holds the width
      mid('cover-word', 18.7, [{ role: 'title', sources: [{ word: 'cover' }, say('Christening')], size: pt(86), color: 'ink' }]),
      mid('cover-of', 25.5, [{ role: 'eyebrow', sources: [say('of our son')], size: pt(30), color: 'accent' }]),
      // likewise her 100 for the baby's name
      mid('cover-name', 38.6, [{ role: 'title', sources: [bind('cover', 'childFull')], size: pt(106), color: 'accent' }]),
      mid('cover-family', 45.9, [{ role: 'sub', sources: [bind('parents', 'familyName')], size: pt(40), color: 'accent' }]),
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
      mid('countdown-line', 65.5, [{ role: 'script', sources: [bind('countdown', 'label'), { word: 'countdown' }, say('before the big day')], size: pt(30), color: 'accent' }]),
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
      mid('hl-name', 20.4, [{ role: 'title', sources: [bind('cover', 'childFull')], size: pt(48), color: 'accent' }], { x: 39, w: 62 }),
      // her "10 · 28 · 2028" has no match among the four formats; the short
      // one ("Oct 28, 2028") is the nearest and is what the page now says
      mid('hl-date', 25.2, [{ role: 'body', sources: [bind('cover', 'date', { show: 'dateShort' })], size: pt(23), color: 'ink' }], { x: 39, w: 62 }),
      ...opener('hl-open-details', 'details', { x: 8, y: 8, w: 62, h: 26 }, { x: 43, y: 35.8, w: 42 }),
      mid('hl-story', 58.8, [{ role: 'script', sources: [say('Our Story')], size: pt(58), color: 'ink' }], { x: 40, w: 40 }),
      ...opener('hl-open-story', 'story', { x: 18, y: 44, w: 44, h: 26 }, { x: 41, y: 68.8, w: 42 }),
      mid('hl-kindly', 47.3, [{ role: 'eyebrow', sources: [say('Kindly')], size: pt(25), color: 'ink' }], { x: 70, w: 28 }),
      mid('hl-rsvp', 48.8, [{ role: 'label-title', sources: [say('RSVP')], size: pt(31), color: 'ink' }], { x: 70, w: 28 }),
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
      mid('social-tag', 57.9, [{ role: 'title', sources: [bind('social', 'hashtag')], size: pt(50), color: 'ink' }]),
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
      mid('close-sign', 50.2, [{ role: 'script', sources: [bind('closing', 'signature')], size: pt(25), color: 'ink' }]),
      mid('close-when', 67.7, [{ role: 'caption', sources: [bind('cover', 'date', { show: 'dateShort' })], size: pt(20), color: 'ink' }]),
      mid('close-tag', 76.3, [{ role: 'caption', sources: [bind('social', 'hashtag')], size: pt(20), color: 'ink' }], { hidden: 'whenEmpty' }),
    ],
  },

  // ───────────────────── behind the oval: Our Story ─────────────────────
  {
    key: 'our-story', label: { en: 'Our Story' }, sections: ['story'], booklet: 'story', drawn: true,
    ground: ground('our-story', 1.7778),
    elements: [
      mid('story-head', 8, [{ role: 'title', sources: [{ word: 'title:story' }, say('Our Story')], size: pt(108), color: 'ink' }]),
      mid('story-line', 16.5, [{ role: 'sub', sources: [bind('story', 'line'), { word: 'story' }], size: pt(30), color: 'ink' }]),
      // her four milestones, two down each side of the drawn frames; each is
      // placed by its date line and left to grow downward
      ...[
        { i: 0, left: 6, y: 35.5 }, { i: 1, left: 59.8, y: 49.8 },
        { i: 2, left: 6, y: 64.6 }, { i: 3, left: 61, y: 79.5 },
      ].map(({ i, left, y }) => col(`story-note-${i + 1}`, left, y, 32, [
        { role: 'script', sources: [bind('story', 'timeline', { index: i, sub: 'date' })], size: pt(29.6), color: 'ink' },
        { role: 'label-title', sources: [bind('story', 'timeline', { index: i, sub: 'title' })], size: pt(29.6), color: 'ink' },
        { role: 'label-text', sources: [bind('story', 'timeline', { index: i, sub: 'text' })], size: pt(18.8), color: 'ink' },
      ], { hidden: 'whenEmpty' })),
    ],
  },
  {
    key: 'gallery', label: { en: 'Baby photos' }, sections: ['gallery'], booklet: 'story', drawn: true,
    ground: ground('gallery', 1.7778),
    elements: [
      col('gallery-left', 7.5, 37.8, 22, [{ role: 'script', sources: [bind('gallery', 'note'), { word: 'galleryNote' }, say('Mom and Dad love you!')], size: pt(35), color: 'accent' }]),
      col('gallery-right', 72, 54.8, 22, [{ role: 'script', sources: [bind('gallery', 'close'), { word: 'galleryClose' }, say('You are our greatest blessing!')], size: pt(30), color: 'accent', align: 'right' }]),
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
      mid('inv-head', 18.2, [{ role: 'title', sources: [{ word: 'title:invitation' }, say('C E R E M O N Y')], size: pt(50), color: 'ink' }]),
      mid('inv-line', 24.5, [{ role: 'sub', sources: [{ word: 'invitation' }, say('Join us as we welcome our little one into God’s family')], size: pt(35), color: 'ink' }], { w: 60 }),
      mid('inv-name', 32.9, [{ role: 'title', sources: [bind('cover', 'childFull')], size: pt(86), color: 'ink' }]),
      mid('inv-family', 39.1, [{ role: 'sub', sources: [bind('parents', 'familyName')], size: pt(25), color: 'ink' }]),
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
      mid('gp-head', 19.1, [{ role: 'title', sources: [{ word: 'title:sponsors' }, say('G O D P A R E N T S')], size: pt(46.8), color: 'accent' }]),
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
      mid('venue-cer-head', 14.9, [{ role: 'title', sources: [say('C E R E M O N Y')], size: pt(40), color: 'muted' }]),
      mid('venue-cer-name', 21.8, [{ role: 'label-title', sources: [bind('ceremony', 'venue')], size: pt(30), color: 'accent' }]),
      mid('venue-cer-where', 29.8, [
        { role: 'body', sources: [bind('ceremony', 'address')], size: pt(25), color: 'accent' },
        { role: 'body', sources: [bind('ceremony', 'time', { show: 'time' })], size: pt(25), color: 'accent' },
      ]),
      mid('venue-rec-head', 58.4, [{ role: 'title', sources: [{ word: 'title:venue' }, say('R E C E P T I O N')], size: pt(40), color: 'muted' }]),
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
      mid('dress-head', 8, [{ role: 'title', sources: [{ word: 'title:dressCode' }, say('D R E S S   C O D E')], size: pt(46), color: 'ink' }]),
      mid('dress-what', 14.5, [{ role: 'label-title', sources: [bind('dressCode', 'attireText'), say('SMART CASUAL')], size: pt(30), color: 'accent' }]),
      mid('dress-note', 88, [{ role: 'caption', sources: [bind('dressCode', 'paletteNote'), { word: 'dressNote' }], size: pt(22), color: 'ink' }], { w: 70, hidden: 'whenEmpty' }),
    ],
  },
  {
    key: 'program', label: { en: 'Program' }, sections: ['program'], booklet: 'details', drawn: true,
    ground: ground('program', 1.4815),
    elements: [
      mid('prog-head', 7.1, [{ role: 'title', sources: [{ word: 'title:program' }, say('Program')], size: pt(60), color: 'ink' }]),
      // her six slots, left and right in turn down the drawn spine
      ...[
        { i: 0, left: 10.7, y: 15.8 }, { i: 1, left: 57.5, y: 31.9 },
        { i: 2, left: 10.2, y: 47.8 }, { i: 3, left: 57.5, y: 63.8 },
        { i: 4, left: 10.7, y: 79.8 }, { i: 5, left: 57.5, y: 95.8 },
      ].map(({ i, left, y }) => col(`prog-${i + 1}`, left, y, 32, [
        { role: 'script', sources: [bind('program', 'items', { index: i, sub: 'time' })], size: pt(29.6), color: 'ink' },
        { role: 'label-title', sources: [bind('program', 'items', { index: i, sub: 'title' })], size: pt(29.6), color: 'ink' },
        { role: 'label-text', sources: [bind('program', 'items', { index: i, sub: 'note' })], size: pt(18.8), color: 'ink' },
      ], { hidden: 'whenEmpty' })),
    ],
  },
  {
    key: 'gift-note', label: { en: 'Gift Note' }, sections: ['gift'], booklet: 'details', drawn: true,
    ground: ground('gift-note', 1.1111),
    elements: [
      mid('gift-head', 9, [{ role: 'title', sources: [{ word: 'title:gift' }, say('G I F T   N O T E')], size: pt(53.8), color: 'ink' }]),
      mid('gift-words', 28.5, [{ role: 'body', sources: [bind('gift', 'text'), { word: 'giftThanks' }], size: pt(32.3), color: 'ink' }], { w: 72 }),
      mid('gift-gcash', 50, [{ role: 'label-title', sources: [say('SEND A GIFT VIA GCASH')], size: pt(30), color: 'ink' }], { hidden: 'whenEmpty' }),
      mid('gift-name', 83, [{ role: 'body', sources: [bind('gift', 'gcashName')], size: pt(35), color: 'ink' }], { hidden: 'whenEmpty' }),
      mid('gift-number', 87.6, [{ role: 'body', sources: [bind('gift', 'gcashNumber')], size: pt(35), color: 'ink' }], { hidden: 'whenEmpty' }),
    ],
  },

  // ──────────────── behind the sealed envelope: the RSVP ────────────────
  {
    key: 'rsvp', label: { en: 'RSVP' }, sections: ['rsvp'], booklet: 'rsvp', drawn: true, grow: true,
    ground: ground('rsvp', 1.7778),
    elements: [
      mid('rsvp-head', 6.9, [{ role: 'title', sources: [{ word: 'title:rsvp' }, say('RSVP')], size: pt(100), color: 'ink' }]),
      mid('rsvp-line', 17.6, [{ role: 'sub', sources: [bind('rsvp', 'note'), say('Kindly confirm your attendance on or before')], size: pt(28), color: 'ink' }], { w: 60 }),
      mid('rsvp-by', 22.6, [{ role: 'label-title', sources: [bind('rsvp', 'deadline', { show: 'date' })], size: pt(28), color: 'ink' }], { hidden: 'whenEmpty' }),
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
