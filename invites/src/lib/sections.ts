import { MOTIF_MIN, MOTIF_MAX } from './palette';
import { attireDefaults, gentsItems, ladiesItems, avoidItems, ATTIRES, AVOID_MAX, type AttireItem } from './attire';
import type { Occasion, Tier } from '@prisma/client';
import { tierAtLeast, TIER_LABELS } from './tiers';
import { GIFT_PRESETS, INTRO_PRESETS, POLICY_PRESETS, RSVP_NOTE_PRESETS, UNPLUGGED_PRESET, TITLES, type Lang, type Preset } from './copy';
import { OPENINGS } from './openings';
import { BACKDROPS } from './backdrops';
import { parseStart } from './song';

/**
 * The shape of an invitation, section by section.
 *
 * One definition drives four things: the DIY builder's forms, the DFY intake
 * form, server-side validation of what either submits, and the renderer that
 * turns the JSON into a page. A field added here appears in all four; a field
 * that is not here cannot be stored. Every template renders this same shape,
 * so switching designs never loses data.
 */

export type Option = {
  value: string;
  label: string;
  /** checks: offered only when the field it depends on holds one of these values */
  when?: string[];
  /** Shown but not selectable below this tier. The renderer gates it again. */
  lockedTier?: Tier;
};

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'time'
  | 'url'
  | 'number'
  | 'toggle'
  | 'image'
  /** a song file, uploaded; stored as its URL, like 'image' */
  | 'audio'
  /** a moment in a song, stored as seconds, picked as minutes and seconds */
  | 'offset'
  | 'select'
  | 'colors'
  /** colours picked from the named palette (src/lib/palette.ts); stored as hex like 'colors' */
  | 'swatches'
  | 'checks'
  | 'person'
  | 'list';

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** select, checks */
  options?: Option[];
  /** select: picking an option copies its text into this sibling field */
  presets?: Preset[];
  presetTarget?: string;
  /** list */
  item?: Field[];
  addLabel?: string;
  /**
   * list, checks: how many at most. text, textarea: how many characters —
   * the fit, not a safety cap. Set per field in FIT below, so what the client
   * types is what the template has room for; the form counts it down and the
   * save cuts anything past it.
   */
  max?: number;
  /** swatches: how many at least, asked at publish */
  min?: number;
  /** swatches: offer the palette's presets — four colours that go together, in one tap */
  sets?: boolean;
  /** checks: the sibling field whose values decide which options (by their 'when') are offered */
  dependsOn?: string;
  /** checks: the list folds away behind a button, the ticked ones showing as chips */
  fold?: boolean;
  /** Render full-width in a two-column form. */
  wide?: boolean;
  /**
   * A fixed writing: the design's own words, with the look's line as its
   * default, and ours to change — per design in the admin, or here for one
   * invitation by staff editing for the customer. Not on the client's form.
   */
  staff?: boolean;
};

export type Person = { title: string; name: string; deceased: boolean };

export type SectionKey =
  | 'cover'
  | 'countdown'
  | 'parents'
  | 'ceremony'
  | 'reception'
  | 'entourage'
  | 'sponsors'
  | 'eighteen'
  | 'dressCode'
  | 'gift'
  | 'rsvp'
  | 'story'
  | 'gallery'
  | 'program'
  | 'faq'
  | 'travel'
  | 'moment'
  | 'social'
  | 'music'
  | 'guestbook'
  | 'photos'
  | 'closing'
  | 'speakers'
  | 'family'
  | 'contact';

export type SectionData = Record<string, unknown>;
export type Content = Partial<Record<SectionKey, SectionData>>;

export type SectionDef = {
  key: SectionKey;
  label: string;
  tl: string;
  description: string;
  minTier: Tier;
  /** Occasions where the lowest tier is different from `minTier`. */
  tierOverride?: Partial<Record<Occasion, Tier>>;
  labelFor?: Partial<Record<Occasion, string>>;
  /** Built, but not offered yet: not in the builder, not on the page. */
  hidden?: true;
  fields: (occasion: Occasion) => Field[];
};

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

const text = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'text', ...extra });
const textarea = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'textarea', wide: true, ...extra });
const date = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'date', ...extra });
const time = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'time', ...extra });
const url = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'url', ...extra });
const image = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'image', ...extra });
const audio = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'audio', ...extra });
const offset = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'offset', ...extra });
const toggle = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'toggle', ...extra });
const number = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'number', ...extra });
const person = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'person', ...extra });
const select = (key: string, label: string, options: Option[], extra: Partial<Field> = {}): Field => ({ key, label, type: 'select', options, ...extra });

/**
 * The ways a cover photograph sits on a design whose ground is artwork. Each
 * is a `data-style` on `.inv-portrait` in globals.css; the veil is the
 * default and what an empty choice means.
 */
export const PHOTO_STYLES: Option[] = [
  { value: 'veil', label: 'Behind the names, veiled' },
  { value: 'arch', label: 'Arched portrait, bronze frame' },
  { value: 'oval', label: 'Oval, double line' },
  { value: 'round', label: 'Round medallion' },
  { value: 'card', label: 'A tucked photo card' },
];
const list = (key: string, label: string, item: Field[], extra: Partial<Field> = {}): Field => ({ key, label, type: 'list', item, wide: true, ...extra });
/** A row of things to tick; stored as the ticked values, in the options' order. */
const checks = (key: string, label: string, options: Option[], extra: Partial<Field> = {}): Field => ({ key, label, type: 'checks', options, wide: true, ...extra });
const attireOptions = (items: AttireItem[]): Option[] => items.map((i) => ({ value: i.value, label: i.en, ...(i.for ? { when: i.for } : {}) }));
const names = (key: string, label: string, extra: Partial<Field> = {}): Field => list(key, label, [text('name', 'Name', { required: true })], { addLabel: 'Add a name', ...extra });

const MAPS_HINT = 'Paste the "Share" link from Google Maps. Guests get a one-tap button.';
const WAZE_HINT = 'Paste a Waze share link (waze.com/ul/…). Optional but loved by drivers.';

function eventBlock(opts: { venueLabel: string; withDate?: boolean; withSeated?: boolean; parking?: boolean }): Field[] {
  return [
    text('venue', opts.venueLabel, { required: true, placeholder: 'e.g. Manila Cathedral' }),
    text('address', 'Full address', { wide: true, placeholder: 'Street, barangay, city, province' }),
    ...(opts.withDate ? [date('date', 'Date', { hint: 'Leave blank to use the date on the cover.' })] : []),
    time('time', 'Time'),
    ...(opts.withSeated ? [text('seatedBy', 'Guests seated by', { placeholder: 'e.g. 1:30 PM' })] : []),
    url('mapsUrl', 'Google Maps link', { hint: MAPS_HINT }),
    url('wazeUrl', 'Waze link', { hint: WAZE_HINT }),
    ...(opts.parking ? [text('parkingNote', 'Parking / shuttle note', { wide: true, placeholder: 'e.g. Free parking at the basement; shuttle from the church at 4:00 PM' })] : []),
    image('photo', 'Venue photo'),
    textarea('note', 'Note to guests'),
  ];
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

const COVER_COMMON = (occasion: Occasion): Field[] => [
  date('date', 'Event date', { required: true }),
  time('time', 'Start time', { required: true }),
  select('introPreset', 'Intro line', INTRO_PRESETS.map((p) => ({ value: p.key, label: p.label })), {
    presets: INTRO_PRESETS,
    presetTarget: 'intro',
    hint: 'Pick a preset, then edit the wording below.',
  }),
  textarea('intro', 'Intro wording', { placeholder: 'Together with their families…', staff: true }),
  image('coverPhoto', 'Cover photo', { hint: 'Portrait works best on phones. This is also the preview image in Messenger and Viber.' }),
  // How the photograph sits on a design whose ground is artwork (Capiz):
  // five settings, so a couple who wants their photo carried differently is
  // one pick away rather than a design change. Blank is the veil.
  select('photoStyle', 'How the photo sits', PHOTO_STYLES, { hint: 'On the Capiz design. Blank is the veil.' }),
  textarea('verse', 'A verse or quote', { placeholder: '“And above all these things put on love, which binds everything together in perfect harmony.”', hint: "Shown after the cover, on designs that carry one. Blank keeps the design's own verse.", staff: true }),
  text('verseRef', 'Its source', { placeholder: 'Colossians 3:14', staff: true }),
  text('interlude2', 'Script line after the venue', { placeholder: 'Nature. Wellness. Forever ours.', staff: true }),
  ...(occasion === 'MEMORIAL'
    ? []
    : [
        select(
          'opening',
          'Opening',
          // Staff-only openings are left out: the cinematic one is artwork
          // somebody has to make, so it is attached to an order, never picked.
          OPENINGS.filter((o) => !o.staffOnly).map((o) => ({ value: o.key, label: o.name, ...(o.minTier === 'BASIC' ? {} : { lockedTier: o.minTier }) })),
          { hint: 'The short moving scene before the invitation. Guests tap once to open it.' },
        ),
        text('openingLine', 'Words on the opening', { placeholder: "You're invited", hint: 'The line on the closed screen. Leave blank and each opening uses its own.' }),
        text('openingLine2', 'Words as it opens', { placeholder: 'Good things begin together', hint: 'Shown while the opening plays. Leave blank to show nothing.' }),
      ]),
];

const SECTION_DEFS: SectionDef[] = [
  {
    key: 'cover',
    label: 'Cover',
    tl: 'Pabalat',
    description: 'Names, date, photo — what the link preview and the first screen show.',
    minTier: 'BASIC',
    fields: (occasion) => {
      switch (occasion) {
        case 'WEDDING':
          return [
            select('kind', 'Card type', [
              { value: 'wedding', label: 'Wedding invitation' },
              { value: 'saveTheDate', label: 'Save the Date' },
              { value: 'thanksgiving', label: 'Thanksgiving Mass announcement' },
            ]),
            text('brideFirst', "Bride's first name", { required: true }),
            text('groomFirst', "Groom's first name", { required: true }),
            text('brideFull', "Bride's full name"),
            text('groomFull', "Groom's full name"),
            text('brideNick', "Bride's nickname"),
            text('groomNick', "Groom's nickname"),
            text('monogram', 'Monogram / initials', { placeholder: 'e.g. J & M' }),
            ...COVER_COMMON(occasion),
          ];
        case 'DEBUT':
          return [
            text('celebrantFirst', "Debutante's first name", { required: true }),
            text('celebrantFull', 'Full name'),
            text('nickname', 'Nickname'),
            text('monogram', 'Monogram / initials'),
            text('theme', 'Theme', { placeholder: 'e.g. Enchanted Garden, Old Hollywood' }),
            ...COVER_COMMON(occasion),
          ];
        case 'CHRISTENING':
        case 'COMMUNION':
          return [
            text('childFull', "Child's full name", { required: true }),
            text('childNick', 'Nickname'),
            date('birthDate', 'Date of birth'),
            toggle('combined', occasion === 'CHRISTENING' ? 'Also a 1st birthday celebration' : 'Also a family celebration'),
            text('theme', 'Theme'),
            ...COVER_COMMON(occasion),
          ];
        case 'KIDS_BIRTHDAY':
        case 'MILESTONE_BIRTHDAY':
          return [
            text('celebrantFirst', "Celebrant's name", { required: true }),
            text('celebrantFull', 'Full name'),
            number('age', 'Turning', { placeholder: '7' }),
            text('theme', 'Theme', { placeholder: 'e.g. Safari, Princess, Lucky 7' }),
            ...COVER_COMMON(occasion),
          ];
        case 'BABY_SHOWER':
          return [
            select('kind', 'Celebration', [
              { value: 'shower', label: 'Baby shower' },
              { value: 'reveal', label: 'Gender reveal' },
            ]),
            text('momName', "Mom-to-be", { required: true }),
            text('dadName', 'Dad-to-be'),
            text('theme', 'Theme'),
            ...COVER_COMMON(occasion),
          ];
        case 'ANNIVERSARY':
          return [
            text('partnerA', 'First name (1)', { required: true }),
            text('partnerB', 'First name (2)', { required: true }),
            number('years', 'Years married', { placeholder: '25' }),
            date('originalDate', 'Original wedding date'),
            toggle('renewal', 'Includes a renewal of vows'),
            ...COVER_COMMON(occasion),
          ];
        case 'ENGAGEMENT':
          return [
            text('partnerA', 'First name (1)', { required: true }),
            text('partnerB', 'First name (2)', { required: true }),
            select('kind', 'Occasion', [
              { value: 'engagement', label: 'Engagement party' },
              { value: 'pamamanhikan', label: 'Pamamanhikan dinner' },
            ]),
            ...COVER_COMMON(occasion),
          ];
        case 'GRADUATION':
          return [
            text('honoree', 'Honoree', { required: true }),
            text('achievement', 'Achievement', { required: true, placeholder: 'e.g. BS Nursing, Cum Laude · Board exam passer' }),
            ...COVER_COMMON(occasion),
          ];
        case 'CORPORATE':
          return [
            text('company', 'Company', { required: true }),
            image('logo', 'Company logo'),
            text('eventName', 'Event name', { required: true, placeholder: 'e.g. Year-End Party 2026' }),
            text('tagline', 'Tagline'),
            ...COVER_COMMON(occasion),
          ];
        case 'HOUSEWARMING':
          return [text('familyName', 'Family name', { required: true, placeholder: 'e.g. The Dela Cruz Family' }), ...COVER_COMMON(occasion)];
        case 'REUNION':
          return [
            text('groupName', 'Reunion of', { required: true, placeholder: 'e.g. Santos Family · UST Batch 2006' }),
            select('kind', 'Kind', [
              { value: 'family', label: 'Family reunion' },
              { value: 'batch', label: 'Class / batch reunion' },
              { value: 'despedida', label: 'Despedida' },
              { value: 'welcome', label: 'Welcome home' },
            ]),
            ...COVER_COMMON(occasion),
          ];
        case 'MEMORIAL':
          return [
            text('name', 'In loving memory of', { required: true }),
            date('bornDate', 'Born'),
            date('diedDate', 'Passed away'),
            select('kind', 'Occasion', [
              { value: 'fortieth', label: '40th day' },
              { value: 'firstYear', label: '1st death anniversary (babang luksa)' },
              { value: 'other', label: 'Other' },
            ]),
            ...COVER_COMMON(occasion),
          ];
      }
    },
  },
  {
    key: 'countdown',
    label: 'Countdown',
    tl: 'Countdown',
    description: 'Counts down to the date and time on the cover.',
    minTier: 'BASIC',
    fields: () => [toggle('enabled', 'Show the countdown'), text('label', 'Label', { placeholder: 'Counting down to the big day', staff: true })],
  },
  {
    key: 'parents',
    hidden: true,
    label: 'Parents',
    tl: 'Mga Magulang',
    description: 'With titles, and a † marker for those who have passed.',
    minTier: 'BASIC',
    labelFor: {
      KIDS_BIRTHDAY: 'Hosts',
      MILESTONE_BIRTHDAY: 'Hosts',
      BABY_SHOWER: 'Hosts',
      ANNIVERSARY: 'Hosts',
      GRADUATION: 'Hosts',
      ENGAGEMENT: 'Parents',
      HOUSEWARMING: 'The family',
      REUNION: 'Organisers',
    },
    fields: (occasion) => {
      if (occasion === 'WEDDING') {
        return [
          select('phrasing', 'Phrasing', [
            { value: 'together', label: 'Together with their parents' },
            { value: 'blessing', label: 'With the blessing of their parents' },
          ], { wide: true }),
          person('brideFather', "Bride's father"),
          person('brideMother', "Bride's mother"),
          text('brideNote', 'Note (bride)', { placeholder: 'e.g. and her guardian Mrs. Elena Reyes' }),
          person('groomFather', "Groom's father"),
          person('groomMother', "Groom's mother"),
          text('groomNote', 'Note (groom)'),
        ];
      }
      if (['DEBUT', 'CHRISTENING', 'COMMUNION', 'KIDS_BIRTHDAY', 'ENGAGEMENT'].includes(occasion)) {
        const two = occasion === 'ENGAGEMENT';
        return [
          person('father', two ? 'Her father' : 'Father'),
          person('mother', two ? 'Her mother' : 'Mother'),
          ...(two ? [person('father2', 'His father'), person('mother2', 'His mother')] : []),
          text('note', 'Note', { wide: true, placeholder: 'e.g. together with Lolo and Lola' }),
        ];
      }
      return [
        list('hosts', 'Hosts', [text('name', 'Name', { required: true }), text('relation', 'Relation', { placeholder: 'e.g. daughter, HR team' })], { addLabel: 'Add a host' }),
        text('note', 'Note', { wide: true }),
      ];
    },
  },
  {
    key: 'ceremony',
    label: 'Ceremony',
    tl: 'Seremonya',
    description: 'Church or venue, time, and one-tap Google Maps and Waze buttons.',
    minTier: 'BASIC',
    labelFor: {
      CHRISTENING: 'Church & Mass',
      COMMUNION: 'Church & Mass',
      DEBUT: 'Mass (optional)',
      HOUSEWARMING: 'House blessing',
      MEMORIAL: 'Thanksgiving Mass',
      ANNIVERSARY: 'Ceremony / Mass',
    },
    fields: (occasion) => [
      ...(occasion === 'WEDDING'
        ? [
            select('type', 'Ceremony type', [
              { value: 'catholic', label: 'Catholic Mass' },
              { value: 'civil', label: 'Civil' },
              { value: 'christian', label: 'Christian' },
              { value: 'inc', label: 'INC' },
              { value: 'nikah', label: 'Nikah' },
              { value: 'garden', label: 'Garden / outdoor' },
              { value: 'other', label: 'Other' },
            ]),
          ]
        : []),
      ...(occasion === 'HOUSEWARMING' ? [text('officiant', 'Officiating priest / pastor')] : []),
      ...eventBlock({ venueLabel: occasion === 'WEDDING' || occasion === 'CHRISTENING' || occasion === 'COMMUNION' || occasion === 'MEMORIAL' ? 'Church / venue' : 'Venue', withDate: true, withSeated: occasion === 'WEDDING' }),
    ],
  },
  {
    key: 'reception',
    label: 'Reception',
    tl: 'Salu-salo',
    description: 'Where the party is, how to get there, and where to park.',
    minTier: 'BASIC',
    labelFor: {
      DEBUT: 'Venue',
      KIDS_BIRTHDAY: 'Venue',
      MILESTONE_BIRTHDAY: 'Venue',
      BABY_SHOWER: 'Venue',
      ENGAGEMENT: 'Venue',
      GRADUATION: 'Venue',
      CORPORATE: 'Venue',
      REUNION: 'Venue',
      HOUSEWARMING: 'Meal',
      MEMORIAL: 'Gathering after the Mass',
    },
    fields: () => eventBlock({ venueLabel: 'Venue', withSeated: false, parking: true }),
  },
  {
    key: 'entourage',
    label: 'Entourage',
    tl: 'Entourage',
    description: 'Principal sponsors, secondary sponsors, and the wedding party. Unlimited rows.',
    minTier: 'STANDARD',
    fields: () => [
      names('brideParents', 'Parents of the bride'),
      names('groomParents', 'Parents of the groom'),
      list('principalSponsors', 'Principal Sponsors (Ninong & Ninang)', [text('ninong', 'Ninong', { placeholder: 'Mr. Jose Santos' }), text('ninang', 'Ninang', { placeholder: 'Mrs. Ana Santos' })], { addLabel: 'Add a pair' }),
      list('secondarySponsors', 'Secondary Sponsors', [
        select('role', 'Role', [{ value: 'candle', label: 'Candle' }, { value: 'veil', label: 'Veil' }, { value: 'cord', label: 'Cord' }]),
        text('first', 'Name'),
        text('second', 'Partner'),
      ], { addLabel: 'Add a pair', max: 6 }),
      text('bestMan', 'Best Man'),
      text('maidOfHonor', 'Maid / Matron of Honor'),
      select('honorTitle', 'Title', [{ value: 'maid', label: 'Maid of Honor' }, { value: 'matron', label: 'Matron of Honor' }]),
      text('officiant', 'Officiant / Presider'),
      names('groomsmen', 'Groomsmen'),
      names('bridesmaids', 'Bridesmaids'),
      names('juniorGroomsmen', 'Junior Groomsmen'),
      names('juniorBridesmaids', 'Junior Bridesmaids'),
      text('littleGroom', 'Little Groom'),
      text('littleBride', 'Little Bride'),
      text('ringBearer', 'Ring Bearer'),
      text('coinBearer', 'Coin (Arrhae) Bearer'),
      text('bibleBearer', 'Bible Bearer'),
      names('flowerGirls', 'Flower Girls'),
    ],
  },
  {
    key: 'sponsors',
    label: 'Ninongs & Ninangs',
    tl: 'Mga Ninong at Ninang',
    description: 'Two columns, as many rows as you need.',
    minTier: 'STANDARD',
    fields: () => [names('ninongs', 'Ninongs'), names('ninangs', 'Ninangs')],
  },
  {
    key: 'eighteen',
    label: 'The Eighteens',
    tl: 'Ang Labing-walo',
    description: '18 Roses, Candles, Treasures, Blue Bills, Balloons, Shots — and the cotillion.',
    minTier: 'STANDARD',
    fields: () => {
      const pair = [text('name', 'Name', { required: true }), text('relation', 'Relationship', { placeholder: 'e.g. Tito, best friend' })];
      return [
        list('roses', '18 Roses', pair, { addLabel: 'Add a rose', max: 18 }),
        list('candles', '18 Candles', pair, { addLabel: 'Add a candle', max: 18 }),
        list('treasures', '18 Treasures', [text('name', 'Name', { required: true }), text('relation', 'Relationship'), text('item', 'Treasure')], { addLabel: 'Add a treasure', max: 18 }),
        list('blueBills', '18 Blue Bills', pair, { addLabel: 'Add a blue bill', max: 18 }),
        list('balloons', '18 Balloons', pair, { addLabel: 'Add a balloon', max: 18 }),
        list('shots', '18 Shots (optional)', pair, { addLabel: 'Add a shot', max: 18 }),
        list('cotillion', 'Cotillion de Honor', [text('name', 'Name', { required: true }), text('partner', 'Partner')], { addLabel: 'Add a pair' }),
      ];
    },
  },
  {
    key: 'dressCode',
    label: 'Dress code',
    tl: 'Kasuotan',
    description: 'What to wear, in colours and lists: the suits and gowns drawn on the page take the colours you pick.',
    minTier: 'BASIC',
    labelFor: { KIDS_BIRTHDAY: 'Theme & attire' },
    fields: (occasion) => [
      checks('attire', 'Dress code', ATTIRES.map((a) => ({ value: a.value, label: a.en })), { min: 1, max: 2, hint: 'One, or two that go together — formal with cocktail, say. The clothes below follow what you pick.' }),
      text('attireText', 'Line under the heading', { placeholder: 'e.g. We kindly encourage our guests to wear elegant formal attire.', hint: 'Blank writes one from the attire picked.', staff: true }),
      { key: 'gentsColors', label: 'Suit colours for the gentlemen', type: 'swatches', max: 4, hint: 'Up to four, from the palette. The suits drawn on the page take these colours; blank uses the motif.' },
      checks('gentsItems', 'For gentlemen', attireOptions(gentsItems(occasion)), { dependsOn: 'attire', min: 2, max: 3, hint: 'Two or three. Only what suits your dress code is offered; guests read them as one line.' }),
      text('gentsNote', 'Note for gentlemen', { placeholder: 'e.g. Tie is optional.', hint: "Blank keeps the design's own note.", staff: true }),
      { key: 'ladiesColors', label: 'Gown colours for the ladies', type: 'swatches', max: 5, hint: 'Up to five, from the palette. The gowns drawn on the page take these colours; blank uses the motif. A pale pick is deepened on the page — no guest wears white.' },
      checks('ladiesItems', 'For ladies', attireOptions(ladiesItems(occasion)), { dependsOn: 'attire', min: 2, max: 3, hint: 'Two or three, the same way.' }),
      text('ladiesNote', 'Note for ladies', { placeholder: 'e.g. We encourage earthy, neutral and muted tones.', hint: "Blank keeps the design's own note.", staff: true }),
      { key: 'colors', label: 'Colour motif', type: 'swatches', min: MOTIF_MIN, max: MOTIF_MAX, sets: true, wide: true, hint: 'Four to eight colours from the palette — start from a set that goes together, or pick your own. Guests see them as the suggested palette, each with its name.' },
      text('paletteNote', 'Note under the palette', { placeholder: 'e.g. You may choose from this palette or similar shades.', staff: true }),
      checks('avoid', 'Kindly avoid', attireOptions(avoidItems(occasion)), { max: AVOID_MAX, fold: true, hint: 'Up to six, from everything guests are ever asked to leave at home. Each one is drawn crossed out on the page.' }),
      text('sponsorsAttire', 'Principal sponsors', { placeholder: 'e.g. Champagne gown / Barong Tagalog' }),
      text('entourageAttire', 'Entourage', { placeholder: 'e.g. Sage green' }),
      textarea('note', 'Note'),
    ],
  },
  {
    key: 'gift',
    label: 'Gift note',
    tl: 'Tungkol sa Regalo',
    description: 'A preset note, a GCash QR, bank details, registry links.',
    minTier: 'STANDARD',
    labelFor: { MEMORIAL: 'In lieu of flowers', KIDS_BIRTHDAY: 'Gift ideas' },
    fields: () => [
      select('preset', 'Preset', GIFT_PRESETS.map((p) => ({ value: p.key, label: p.label })), { presets: GIFT_PRESETS, presetTarget: 'text' }),
      textarea('text', 'Gift note', { staff: true }),
      text('gcashName', 'GCash name'),
      text('gcashNumber', 'GCash number', { placeholder: '0917 000 0000' }),
      image('gcashQr', 'GCash / Maya QR', { hint: 'A screenshot of your QR from the app.' }),
      textarea('bankDetails', 'Bank details', { placeholder: 'BPI · Juan Dela Cruz · 0000 0000 00' }),
      list('registry', 'Registry links', [text('label', 'Label', { required: true }), url('url', 'Link', { required: true })], { addLabel: 'Add a link', max: 5 }),
    ],
  },
  {
    key: 'rsvp',
    label: 'RSVP',
    tl: 'RSVP',
    description: 'Deadline, what to ask, and the policy line.',
    minTier: 'BASIC',
    fields: (occasion) => [
      date('deadline', 'RSVP deadline', { hint: `The form closes after this date on the ${TIER_LABELS.COMPLETE} package.` }),
      toggle('showSeats', 'Ask how many are coming'),
      toggle('collectAttendees', 'Ask who is coming with them (the names of their companions)'),
      toggle('askDietary', 'Ask about allergies / dietary notes'),
      list('groups', 'Guest groups', [text('label', 'Group', { required: true, placeholder: 'e.g. Principal sponsor (Ninong / Ninang)' })], {
        addLabel: 'Add a group',
        max: 12,
        hint: (GUEST_GROUP_PRESETS[occasion]?.length
          ? `Guests pick one of these when they RSVP, and your printed headcount sheet is grouped by them. Leave it blank and we ask the standard list for this occasion: ${GUEST_GROUP_PRESETS[occasion]!.join(' · ')}. Write your own here to replace it.`
          : 'Guests pick one of these when they RSVP, and your printed headcount sheet is grouped by them. Leave it blank to ask nothing.'),
      }),
      toggle('hideGroups', 'Skip the group question'),
      list('mealChoices', `Meal choices (${TIER_LABELS.COMPLETE} package)`, [text('label', 'Choice', { required: true, placeholder: 'e.g. Chicken' })], { addLabel: 'Add a choice', max: 8, hint: 'Up to eight, in your own words — Beef, Chicken, Pork, Fish, Vegetarian, Vegan, Halal, Kids’ meal, or the dishes themselves.' }),
      select('policy', 'Policy', [{ value: 'none', label: 'No policy line' }, ...POLICY_PRESETS.map((p) => ({ value: p.key, label: p.label }))], { presets: POLICY_PRESETS, presetTarget: 'policyText' }),
      textarea('policyText', 'Policy wording', { staff: true }),
      select('notePreset', 'RSVP note', RSVP_NOTE_PRESETS.map((p) => ({ value: p.key, label: p.label })), { presets: RSVP_NOTE_PRESETS, presetTarget: 'note' }),
      textarea('note', 'RSVP note', { hint: '{n} becomes the reserved seats on a personal link; {date} the deadline.', staff: true }),
      ...(occasion === 'CORPORATE' ? [toggle('askDepartment', 'Ask for department / company')] : []),
      text('contactPhone', 'RSVP by text', { placeholder: 'Mobile number guests can text instead' }),
      textarea('reminderText', 'Reminder message', { hint: 'Used when RSVP reminders are sent from the guest list.', staff: true }),
    ],
  },
  {
    key: 'story',
    label: 'Our story',
    tl: 'Ang Aming Kuwento',
    description: 'How you met, the proposal, and a timeline with its photos — and the line under the heading.',
    minTier: 'STANDARD',
    labelFor: { MILESTONE_BIRTHDAY: 'Their story', ANNIVERSARY: 'Our story so far' },
    fields: (occasion) =>
      occasion === 'CHRISTENING'
        ? [
            text('line', 'Line under the heading', { placeholder: 'e.g. A little prayer, a big answer.', hint: "Blank keeps the design's own line.", wide: true, staff: true }),
            list('timeline', 'Milestones', [text('title', 'Milestone', { required: true, placeholder: 'e.g. The Prayer' }), text('text', 'A line under it', { placeholder: 'e.g. It all started with a prayer.' }), image('photo', 'Photo in its frame')], { addLabel: 'Add a milestone', max: 6 }),
          ]
        : [
            text('line', 'Line under the heading', { placeholder: 'e.g. English', hint: "Blank keeps the design's own line.", wide: true, staff: true }),
            textarea('howWeMet', 'How we met'),
            textarea('proposal', 'The proposal'),
            list('timeline', 'Timeline', [text('date', 'When', { placeholder: 'June 2019' }), text('title', 'Title', { required: true }), textarea('text', 'Story'), image('photo', 'Photo (shown beside the timeline)')], { addLabel: 'Add a moment', max: 12 }),
          ],
  },
  {
    key: 'gallery',
    label: 'Prenup photos & video',
    tl: 'Mga Larawan',
    description: 'Your photos with their captions, your video, and the lines written around them on the page.',
    /**
     * Standard and up. Basic's one photo is the cover photo, which every
     * occasion's cover carries and which is not counted against the gallery:
     * the gallery page is a designed layout — one large photo, three under the
     * arches, the rest in a mosaic — and a single photo cannot fill it. Better
     * to give Basic the cover alone than three empty arches.
     */
    minTier: 'STANDARD',
    /**
     * Whose photos these are; the label above is the wedding's. Corporate and
     * housewarming carry no gallery, so nothing falls back to "Prenup". The
     * guest-facing heading stays "Gallery" whatever the occasion.
     */
    labelFor: { CHRISTENING: 'Baby photos', BABY_SHOWER: 'Baby photos', KIDS_BIRTHDAY: "Celebrant's photos", MILESTONE_BIRTHDAY: "Celebrant's photos", COMMUNION: 'Photos', DEBUT: 'Photos & video', ANNIVERSARY: 'Photos & video', ENGAGEMENT: 'Photos', GRADUATION: 'Photos', REUNION: 'Photos', MEMORIAL: 'Photos' },
    fields: () => [
      text('line', 'Line under the heading', { placeholder: 'e.g. Moments we\'ll always cherish', hint: "Blank keeps the design's own line.", wide: true, staff: true }),
      list('photos', 'Photos', [image('url', 'Photo', { required: true }), text('caption', 'Caption')], { addLabel: 'Add a photo' }),
      text('note', 'Line between the large photo and the arches', { placeholder: 'e.g. These are the moments that reminded us — it has always been you.', hint: "Blank keeps the design's own line.", wide: true, staff: true }),
      url('videoUrl', `Video link (${TIER_LABELS.COMPLETE} package)`, { hint: 'YouTube, Vimeo or a public Facebook video link. It plays on the page behind its own still.' }),
      text('videoTitle', 'Title written over the video', { placeholder: 'e.g. Our story in motion', hint: "Blank keeps the design's own line.", staff: true }),
      text('close', 'The last word on the page', { placeholder: 'e.g. Some love stories deserve to be seen.', hint: "Blank keeps the design's own line.", wide: true, staff: true }),
    ],
  },
  {
    key: 'program',
    label: 'Program',
    tl: 'Programa',
    description: 'The timeline of the day.',
    minTier: 'COMPLETE',
    tierOverride: { CORPORATE: 'BASIC', KIDS_BIRTHDAY: 'STANDARD' },
    labelFor: { CORPORATE: 'Agenda', KIDS_BIRTHDAY: 'Activities' },
    fields: (occasion) => [
      list('items', 'Schedule', [text('time', 'Time', { placeholder: '2:00 PM' }), text('title', 'What', { required: true }), text('note', 'Note')], { addLabel: 'Add an item', max: 30 }),
      ...(occasion === 'KIDS_BIRTHDAY' ? [textarea('activities', 'Games & activities')] : []),
    ],
  },
  {
    key: 'faq',
    hidden: true,
    label: 'FAQ',
    tl: 'Mga Paalala',
    description: 'Parking, kids, rain plan, shuttle, hashtag reminders.',
    minTier: 'STANDARD',
    fields: () => [list('items', 'Questions', [text('q', 'Question', { required: true }), textarea('a', 'Answer', { required: true })], { addLabel: 'Add a question', max: 20 })],
  },
  {
    key: 'moment',
    // Retired: the framed view between the verse and the story is not in the
    // plan. The cover carries the three lines; the page and its form are gone.
    hidden: true,
    label: 'The moment',
    tl: 'Ang Sandali',
    description: 'A framed view — your own photo behind the arch, or a painted Philippine scene when a photo would fight the design.',
    minTier: 'STANDARD',
    fields: () => [
      image('backdrop', 'Your photo', { hint: 'Portrait works best. Sits behind the frame, and can be swapped any time without touching the rest of the page.' }),
      select('preset', 'Painted scene instead', BACKDROPS.map((b) => ({ value: b.key, label: `${b.label} — ${b.place}` })), {
        hint: 'Used only when no photo is set. Every scene is somewhere in the Philippines.',
      }),
      select('frame', 'Frame', [
        { value: 'arch', label: 'Capiz arch' },
        { value: 'window', label: 'Capiz window' },
        { value: 'none', label: 'No frame — full bleed' },
      ]),
      text('line1', 'First line', { placeholder: 'Same horizons', staff: true }),
      text('line2', 'Second line', { placeholder: 'A brighter', staff: true }),
      text('line3', 'Third line', { placeholder: 'Tomorrow', staff: true }),
    ],
  },
  {
    key: 'travel',
    hidden: true,
    label: 'Accommodation & travel',
    tl: 'Tuluyan at Biyahe',
    description: 'Hotels, booking codes, directions from Manila.',
    minTier: 'COMPLETE',
    fields: () => [
      list('hotels', 'Where to stay', [text('name', 'Hotel', { required: true }), text('address', 'Address'), text('note', 'Booking code / rate'), url('url', 'Link')], { addLabel: 'Add a hotel', max: 8 }),
      textarea('directions', 'Directions'),
      textarea('tips', 'Transport tips'),
    ],
  },
  {
    key: 'social',
    label: 'Hashtag & social',
    tl: 'Hashtag',
    description: 'Official hashtag, handles, and the unplugged-ceremony note.',
    minTier: 'STANDARD',
    fields: () => [
      text('hashtag', 'Hashtag', { placeholder: '#JuanAndMariaSayIDo' }),
      text('instagram', 'Instagram'),
      text('tiktok', 'TikTok'),
      text('facebook', 'Facebook'),
      toggle('unplugged', 'Unplugged ceremony note'),
      textarea('unpluggedText', 'Wording', { placeholder: UNPLUGGED_PRESET.en, staff: true }),
    ],
  },
  {
    key: 'music',
    label: 'Background music',
    tl: 'Musika',
    description: 'The song that plays behind the page as the invitation opens, from the moment you choose.',
    minTier: 'STANDARD',
    fields: () => [
      text('song', 'Your song', { placeholder: 'e.g. Ikaw — Yeng Constantino, or a Spotify / YouTube link', hint: 'The title and artist, or paste a link from Spotify or YouTube. A song cannot stream from Spotify or YouTube behind a page, so what plays is a file — we make it from whatever you name here.', wide: true }),
      offset('start', 'Start the song at', { hint: 'Minutes and seconds into the song, to skip a long intro. The music starts here every time it plays.' }),
      audio('url', 'Your own audio file (optional)', { hint: 'Only if you already have the song as an MP3 or M4A, up to 20 MB. You do not need to: naming it above is enough, and we prepare the file.' }),
    ],
  },
  {
    key: 'guestbook',
    label: 'Guestbook',
    tl: 'Mga Pagbati',
    description: 'A well-wishes wall guests can write on. You approve each message.',
    minTier: 'COMPLETE',
    fields: () => [toggle('enabled', 'Show the guestbook'), text('prompt', 'Prompt', { placeholder: 'Leave a message for the couple', staff: true }), toggle('moderated', 'Approve messages before they show')],
  },
  {
    key: 'photos',
    label: 'Guest photos',
    labelFor: { CHRISTENING: 'Post-event photos' },
    tl: 'Mga Larawan ng Bisita',
    description: 'A shared album your guests add to from their phones. You approve each photo before it appears.',
    minTier: 'COMPLETE',
    fields: () => [
      toggle('enabled', 'Let guests add photos'),
      text('prompt', 'Prompt', { placeholder: 'Share your photos from the day', staff: true }),
      toggle('moderated', 'Approve photos before they show'),
    ],
  },
  {
    key: 'closing',
    label: 'Closing',
    tl: 'Pagtatapos',
    description: 'A photo, a thank-you, your signature, and the line above your names.',
    minTier: 'BASIC',
    fields: () => [
      image('photo', 'Closing photo (above the message)'),
      textarea('message', 'Closing message', { hint: "Blank keeps the design's own thank-you.", staff: true }),
      text('signature', 'Signed', { placeholder: 'Juan & Maria' }),
      text('line', 'Line above the names', { placeholder: 'e.g. See you there!', hint: "Blank keeps the design's own line.", staff: true }),
    ],
  },
  {
    key: 'speakers',
    label: 'Speakers',
    tl: 'Mga Tagapagsalita',
    description: 'Who is on stage.',
    minTier: 'STANDARD',
    fields: () => [list('items', 'Speakers', [text('name', 'Name', { required: true }), text('title', 'Title / company'), text('topic', 'Topic'), image('photo', 'Photo')], { addLabel: 'Add a speaker', max: 20 })],
  },
  {
    key: 'family',
    label: 'The family',
    tl: 'Ang Pamilya',
    description: 'The bereaved family, as it would read on a card.',
    minTier: 'BASIC',
    fields: () => [list('members', 'Family', [text('name', 'Name', { required: true }), text('relation', 'Relation')], { addLabel: 'Add a name' }), textarea('lines', 'Additional lines')],
  },
  {
    key: 'contact',
    label: 'Contact person',
    labelFor: { CHRISTENING: 'Assistance' },
    tl: 'Contact',
    description: 'Who guests can reach with questions.',
    minTier: 'BASIC',
    fields: () => [
      text('name', 'Name'),
      text('phone', 'Mobile'),
      text('name2', 'Second person'),
      text('phone2', 'Their mobile'),
      text('email', 'Email'),
      text('messenger', 'Messenger link'),
      text('chatNote', 'Chat apps', { placeholder: 'Or message us on Viber / WhatsApp.', staff: true }),
      textarea('registrationNote', 'Registration note', { staff: true }),
    ],
  },
];

/**
 * How many characters each writing has room for on the page.
 *
 * A name is set large in a script face across a phone; a milestone's title
 * sits inside a drawn frame; a note under the palette is one or two lines.
 * The client cannot see that while typing, so the limit tells them: the form
 * counts it down and the save cuts anything past it. Keyed `section.field`,
 * or `section.list.field` for a line inside a list row; anything not named
 * gets the type's default. Tune here when a design gains or loses room.
 */
export const FIT_DEFAULT = { text: 80, textarea: 600 } as const;
export const FIT: Record<string, number> = {
  // the cover: names are the largest type on the page
  'cover.brideFirst': 24, 'cover.groomFirst': 24, 'cover.celebrantFirst': 24, 'cover.partnerA': 24, 'cover.partnerB': 24,
  'cover.brideFull': 48, 'cover.groomFull': 48, 'cover.celebrantFull': 48, 'cover.childFull': 48, 'cover.honoree': 48, 'cover.name': 48,
  'cover.brideNick': 20, 'cover.groomNick': 20, 'cover.nickname': 20, 'cover.childNick': 20,
  'cover.monogram': 6, 'cover.theme': 60, 'cover.momName': 40, 'cover.dadName': 40,
  'cover.achievement': 80, 'cover.company': 60, 'cover.eventName': 60, 'cover.tagline': 80, 'cover.groupName': 60,
  'cover.intro': 260, 'cover.verse': 240, 'cover.verseRef': 40, 'cover.interlude2': 60, 'cover.openingLine': 40, 'cover.openingLine2': 60,
  // venues
  'ceremony.venue': 60, 'ceremony.address': 110, 'ceremony.note': 160,
  'reception.venue': 60, 'reception.address': 110, 'reception.note': 160, 'reception.parkingNote': 120,
  // people
  'parents.brideNote': 120, 'parents.groomNote': 120, 'parents.note': 120, 'parents.hosts.name': 48, 'parents.hosts.relation': 40,
  'entourage.first': 40, 'entourage.second': 40, 'entourage.principalSponsors.ninong': 48, 'entourage.principalSponsors.ninang': 48,
  'sponsors.ninongs.name': 48, 'sponsors.ninangs.name': 48,
  'eighteen.treasures.item': 40, 'eighteen.treasures.relation': 40,
  // dress code: lines under a heading, notes under the figures and the palette
  'dressCode.attireText': 90, 'dressCode.gentsNote': 120, 'dressCode.ladiesNote': 120, 'dressCode.paletteNote': 100,
  'dressCode.sponsorsAttire': 90, 'dressCode.entourageAttire': 90, 'dressCode.note': 200,
  // gifts and RSVP
  'gift.text': 320, 'gift.gcashName': 40, 'gift.gcashNumber': 24, 'gift.bankDetails': 300, 'gift.registry.label': 40,
  'rsvp.policyText': 240, 'rsvp.note': 240, 'rsvp.contactPhone': 30, 'rsvp.reminderText': 300, 'rsvp.mealChoices.label': 30,
  // the story: a christening's milestones sit in drawn frames, a wedding's run down a timeline
  'story.line': 80, 'story.howWeMet': 600, 'story.proposal': 600,
  'story.timeline.title': 28, 'story.timeline.text': 70, 'story.timeline.date': 24,
  // photos
  'gallery.line': 80, 'gallery.note': 90, 'gallery.videoTitle': 40, 'gallery.close': 60, 'gallery.photos.caption': 40,
  'moment.line1': 40, 'moment.line2': 40, 'moment.line3': 40,
  // the day
  'program.items.time': 12, 'program.items.title': 40, 'program.items.note': 60,
  'faq.items.q': 120, 'faq.items.a': 400,
  'travel.hotels.name': 60, 'travel.hotels.address': 100, 'travel.hotels.note': 80,
  'social.hashtag': 40, 'social.instagram': 60, 'social.tiktok': 60, 'social.facebook': 60, 'social.unpluggedText': 240,
  'music.song': 80, 'guestbook.prompt': 120, 'photos.prompt': 120,
  'closing.message': 320, 'closing.signature': 60, 'closing.line': 60,
  'contact.name': 40, 'contact.name2': 40, 'contact.phone': 30, 'contact.phone2': 30, 'contact.email': 80, 'contact.messenger': 200, 'contact.chatNote': 120, 'contact.registrationNote': 240,
  'speakers.items.name': 40, 'speakers.items.title': 60, 'speakers.items.topic': 80,
};

/** The room a writing has: its own entry in FIT, else the type's default. */
export function fitOf(path: string, type: FieldType): number | undefined {
  if (type !== 'text' && type !== 'textarea') return undefined;
  return FIT[path] ?? FIT_DEFAULT[type];
}

/** Every writing in a section carries its limit, list rows included. A list's own `max` (how many rows) is left alone. */
function withLimits(section: SectionKey, fields: Field[]): Field[] {
  return fields.map((f) => {
    if (f.type === 'list') return { ...f, item: (f.item ?? []).map((i) => (i.type === 'text' || i.type === 'textarea' ? { ...i, max: fitOf(`${section}.${f.key}.${i.key}`, i.type) } : i)) };
    if (f.type === 'text' || f.type === 'textarea') return { ...f, max: fitOf(`${section}.${f.key}`, f.type) };
    return f;
  });
}

export const SECTION_BY_KEY: Record<SectionKey, SectionDef> = Object.fromEntries(
  SECTION_DEFS.map((s) => [s.key, { ...s, fields: (occasion: Occasion) => withLimits(s.key, s.fields(occasion)) }]),
) as Record<SectionKey, SectionDef>;

/** Which sections each occasion carries, in page order. */
export const OCCASION_SECTIONS: Record<Occasion, SectionKey[]> = {
  WEDDING: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'entourage', 'dressCode', 'gift', 'rsvp', 'story', 'gallery', 'program', 'faq', 'travel', 'moment', 'social', 'music', 'guestbook', 'photos', 'contact', 'closing'],
  DEBUT: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'eighteen', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'moment', 'social', 'music', 'guestbook', 'photos', 'closing'],
  CHRISTENING: ['cover', 'countdown', 'parents', 'sponsors', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'story', 'gallery', 'program', 'faq', 'social', 'music', 'guestbook', 'photos', 'contact', 'closing'],
  KIDS_BIRTHDAY: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'program', 'gallery', 'faq', 'music', 'photos', 'closing'],
  MILESTONE_BIRTHDAY: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'story', 'moment', 'gallery', 'program', 'faq', 'music', 'guestbook', 'photos', 'closing'],
  BABY_SHOWER: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'photos', 'closing'],
  ANNIVERSARY: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'story', 'moment', 'gallery', 'program', 'faq', 'music', 'guestbook', 'photos', 'closing'],
  ENGAGEMENT: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'rsvp', 'gallery', 'moment', 'faq', 'photos', 'closing'],
  GRADUATION: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'photos', 'closing'],
  COMMUNION: ['cover', 'countdown', 'parents', 'sponsors', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'faq', 'photos', 'closing'],
  CORPORATE: ['cover', 'countdown', 'reception', 'program', 'speakers', 'dressCode', 'rsvp', 'contact', 'faq', 'photos', 'closing'],
  HOUSEWARMING: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'rsvp', 'gift', 'faq', 'photos', 'closing'],
  REUNION: ['cover', 'countdown', 'parents', 'reception', 'program', 'rsvp', 'gallery', 'faq', 'contact', 'photos', 'closing'],
  MEMORIAL: ['cover', 'family', 'ceremony', 'reception', 'gift', 'rsvp', 'gallery', 'photos', 'closing'],
};

/** The sections a customer can fill for this occasion — the hidden ones left out. */
/**
 * A layout may tell its sections in a different order from the occasion's —
 * Capiz follows the reference it was drawn from: the story and the details
 * first, the forms and the countdown at the end. Keys not listed keep their
 * occasion order after the ones that are.
 */
export const LAYOUT_ORDER: Partial<Record<string, SectionKey[]>> = {
  capiz: ['cover', 'story', 'ceremony', 'entourage', 'gallery', 'reception', 'dressCode', 'gift', 'program', 'social', 'guestbook', 'photos', 'rsvp', 'countdown', 'contact', 'closing'],
  // Baby Blue: cover with the verse, the story, the invitation, ninong and
  // ninang, baby photos, the venue, the dress code, gift and program, snap and
  // share with the post-event photos, then RSVP, countdown, assistance, ending.
  babyblue: ['cover', 'story', 'ceremony', 'sponsors', 'gallery', 'reception', 'dressCode', 'gift', 'program', 'social', 'photos', 'rsvp', 'countdown', 'contact', 'closing'],
};

/** The layouts built as a run of pages, each on its own ground. */
export const PAGED_LAYOUTS = ['capiz', 'babyblue'] as const;
export function isPaged(layout: string): boolean {
  return (PAGED_LAYOUTS as readonly string[]).includes(layout);
}

/**
 * How many photographs a design's photo page holds, where the page is drawn
 * with frames: Baby Blue's has four polaroids and that is the page. Any other
 * design lays out however many the package allows.
 */
const LAYOUT_PHOTO_FRAMES: Record<string, number> = { babyblue: 4 };
export function photoFrames(layout: string): number {
  return LAYOUT_PHOTO_FRAMES[layout] ?? Infinity;
}
/**
 * What the photos list says under itself on a design with frames, keyed by
 * the list's field. Nothing: the client chose the design by its cover and can
 * see the page as they fill it, so the form does not describe the page — the
 * count beside the list says how many it holds.
 */
export function photoFramesHint(layout: string): Record<string, string> | undefined {
  void layout;
  return undefined;
}

export function sectionOrder(occasion: Occasion, layout: string): SectionKey[] {
  const base = OCCASION_SECTIONS[occasion];
  const own = LAYOUT_ORDER[layout];
  if (!own) return base;
  const listed = own.filter((k) => base.includes(k));
  return [...listed, ...base.filter((k) => !listed.includes(k))];
}

/**
 * A Save the Date says who, when, and roughly where — and stops. It goes out
 * months ahead, when the couple has a date and little else; asking them for an
 * entourage or a gift note they cannot answer yet is how a card sits unsent.
 */
export const SAVE_THE_DATE_SECTIONS: readonly SectionKey[] = ['cover', 'countdown'];

/** The cover's opening controls, which a Save the Date has no use for. */
const OPENING_FIELDS = new Set(['opening', 'openingLine', 'openingLine2', 'envelope']);

export function sectionsFor(occasion: Occasion, saveTheDate = false): SectionDef[] {
  const keys = saveTheDate ? OCCASION_SECTIONS[occasion].filter((k) => SAVE_THE_DATE_SECTIONS.includes(k)) : OCCASION_SECTIONS[occasion];
  return keys.map((k) => SECTION_BY_KEY[k]).filter((d) => !d.hidden);
}

/** Whether this invitation carries the section at all. */
export function sectionOnCard(key: SectionKey, occasion: Occasion, saveTheDate: boolean): boolean {
  if (!OCCASION_SECTIONS[occasion].includes(key)) return false;
  return !saveTheDate || SAVE_THE_DATE_SECTIONS.includes(key);
}

/** Whether a section is part of what is offered today. */
export function sectionOffered(key: SectionKey): boolean {
  return !SECTION_BY_KEY[key].hidden;
}

export function sectionLabel(key: SectionKey, occasion: Occasion): string {
  const def = SECTION_BY_KEY[key];
  return def.labelFor?.[occasion] ?? def.label;
}

export function sectionMinTier(key: SectionKey, occasion: Occasion): Tier {
  const def = SECTION_BY_KEY[key];
  return def.tierOverride?.[occasion] ?? def.minTier;
}

export function sectionUnlocked(key: SectionKey, occasion: Occasion, tier: Tier): boolean {
  return tierAtLeast(tier, sectionMinTier(key, occasion));
}

/**
 * The fields for one section. Pass the invitation's tier and any option the
 * tier cannot have comes back marked `lockedTier`, so the form can show it
 * greyed out with the package name instead of hiding it. Without a tier
 * nothing is locked — validation and the renderer gate it anyway.
 */
/** The fields the client fills. The fixed writings (`staff`) are ours, and are not on their form. */
export function customerFields(fields: Field[]): Field[] {
  return fields.filter((f) => !f.staff);
}

/**
 * A client's save keeps the fixed writings as they were: their form never
 * carried them, so a blank in what they sent must not overwrite ours.
 */
export function keepStaffFields(fields: Field[], before: SectionData | undefined, data: SectionData): SectionData {
  for (const f of fields) if (f.staff && before && f.key in before) data[f.key] = before[f.key];
  return data;
}

export function fieldsFor(key: SectionKey, occasion: Occasion, tier?: Tier, saveTheDate = false): Field[] {
  // A Save the Date is read on sight — the renderer plays no opening on one,
  // so the three controls for it would be levers connected to nothing.
  const all = SECTION_BY_KEY[key].fields(occasion);
  const fields = saveTheDate && key === 'cover' ? all.filter((f) => !OPENING_FIELDS.has(f.key)) : all;
  if (!tier) return fields;
  return fields.map((f) =>
    f.options?.some((o) => o.lockedTier)
      ? { ...f, options: f.options.map((o) => (o.lockedTier && tierAtLeast(tier, o.lockedTier) ? { value: o.value, label: o.label } : o)) }
      : f,
  );
}

// ---------------------------------------------------------------------------
// Defaults and validation
// ---------------------------------------------------------------------------

function emptyValue(field: Field): unknown {
  switch (field.type) {
    case 'toggle':
      return false;
    case 'number':
    case 'offset':
      return null;
    case 'colors':
    case 'swatches':
    case 'checks':
    case 'list':
      return [];
    case 'person':
      return { title: '', name: '', deceased: false } satisfies Person;
    default:
      return '';
  }
}

export function emptySection(fields: Field[]): SectionData {
  const out: SectionData = {};
  for (const f of fields) out[f.key] = emptyValue(f);
  return out;
}

/** A fresh invitation's content: every section present, sensible toggles on. */
/** The six milestones a christening story is drawn with — the client's to rename, one per frame. */
export const CHRISTENING_MILESTONES: { title: string; text: string }[] = [
  { title: 'The Prayer', text: 'It all started with a prayer.' },
  { title: 'The Wait', text: 'A season of faith, patience, and love.' },
  { title: 'The Answer', text: 'You made our hearts fuller.' },
  { title: 'The Preparation', text: 'Tiny outfits, big dreams.' },
  { title: 'The Arrival', text: 'A new chapter begins.' },
  { title: 'Our Greatest Blessing', text: 'You are so loved.' },
];

export function defaultContent(occasion: Occasion, lang: Lang = 'en'): Content {
  const content: Content = {};
  // Every section the occasion lists, hidden ones included: what is stored
  // must not depend on what is offered this month, or un-hiding a section
  // later would find invitations with no slot for it.
  for (const def of OCCASION_SECTIONS[occasion].map((k) => SECTION_BY_KEY[k])) {
    const data = emptySection(def.fields(occasion));
    switch (def.key) {
      case 'cover':
        data.introPreset = 'families';
        data.intro = '';
        data.opening = 'universal';
        if (occasion === 'WEDDING') data.kind = 'wedding';
        break;
      case 'countdown':
        data.enabled = true;
        break;
      case 'story':
        if (occasion === 'CHRISTENING') data.timeline = CHRISTENING_MILESTONES.map((m) => ({ ...m, photo: '' }));
        break;
      case 'moment':
        data.frame = 'arch';
        break;
      case 'parents':
        if (occasion === 'WEDDING') data.phrasing = 'together';
        break;
      case 'dressCode': {
        const d = attireDefaults(occasion);
        data.attire = d.attire;
        data.gentsItems = d.gents;
        data.ladiesItems = d.ladies;
        data.avoid = d.avoid;
        break;
      }
      case 'gift':
        data.preset = 'presence';
        data.text = lang === 'tl' ? GIFT_PRESETS[0].tl : GIFT_PRESETS[0].en;
        break;
      case 'rsvp':
        data.showSeats = true;
        data.collectAttendees = true;
        data.askDietary = false;
        data.policy = 'none';
        data.notePreset = 'reserved';
        data.note = lang === 'tl' ? RSVP_NOTE_PRESETS[0].tl : RSVP_NOTE_PRESETS[0].en;
        break;
      case 'social':
        data.unpluggedText = lang === 'tl' ? UNPLUGGED_PRESET.tl : UNPLUGGED_PRESET.en;
        break;
      case 'guestbook':
        data.enabled = true;
        data.moderated = true;
        break;
      case 'dressCode':
        data.avoidWhite = occasion === 'WEDDING';
        break;
    }
    content[def.key] = data;
  }
  return content;
}

const LIMITS = { text: 300, textarea: 4000, url: 1000, listDefault: 200 };
const HEX = /^#[0-9a-fA-F]{6}$/;

export type Issue = { path: string; message: string };

function cleanString(v: unknown, max: number): string {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

/** Only http(s) links or an upload path we produced ourselves. */
function cleanUrl(v: unknown, path: string, issues: Issue[]): string {
  const s = cleanString(v, LIMITS.url);
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('/uploads/')) return s;
  issues.push({ path, message: 'Links must start with http:// or https://' });
  return '';
}

function cleanField(field: Field, raw: unknown, path: string, issues: Issue[]): unknown {
  switch (field.type) {
    // cut to the room the page has for it (the field's fit), else the safety cap
    case 'text':
      return cleanString(raw, field.max ?? LIMITS.text);
    case 'textarea':
      return cleanString(raw, field.max ?? LIMITS.textarea);
    case 'date': {
      const s = cleanString(raw, 10);
      if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        issues.push({ path, message: 'Use the date picker (YYYY-MM-DD).' });
        return '';
      }
      return s;
    }
    case 'time': {
      const s = cleanString(raw, 5);
      if (s && !/^\d{2}:\d{2}$/.test(s)) {
        issues.push({ path, message: 'Use the time picker (HH:MM).' });
        return '';
      }
      return s;
    }
    case 'url':
    case 'image':
    case 'audio':
      return cleanUrl(raw, path, issues);
    case 'offset': {
      // seconds into the song; none is null, so an untouched field is not a "started" one
      const n = parseStart(raw);
      return n > 0 ? n : null;
    }
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        issues.push({ path, message: 'Must be a number.' });
        return null;
      }
      return Math.max(0, Math.min(999, Math.round(n)));
    }
    case 'toggle':
      return raw === true || raw === 'true' || raw === 'on' || raw === 1;
    case 'select': {
      const s = cleanString(raw, 60);
      if (s && field.options && !field.options.some((o) => o.value === s)) {
        issues.push({ path, message: 'Pick one of the options.' });
        return '';
      }
      return s;
    }
    case 'colors':
    case 'swatches': {
      const arr = Array.isArray(raw) ? raw : [];
      return arr
        .map((c) => cleanString(c, 7))
        .filter((c) => HEX.test(c))
        .slice(0, field.max ?? 5);
    }
    case 'checks': {
      // the ticked options only, kept in the options' order; a single word (how the attire was stored once) counts as one tick
      const arr = Array.isArray(raw) ? raw.map((v) => cleanString(v, 40)) : typeof raw === 'string' && raw ? [cleanString(raw, 40)] : [];
      const ticked = (field.options ?? []).map((o) => o.value).filter((v) => arr.includes(v));
      return field.max ? ticked.slice(0, field.max) : ticked;
    }
    case 'person': {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Person>;
      const title = cleanString(p.title, 30);
      return {
        title: TITLES.includes(title) ? title : title.slice(0, 20),
        name: cleanString(p.name, LIMITS.text),
        deceased: p.deceased === true || (p.deceased as unknown) === 'true' || (p.deceased as unknown) === 'on',
      } satisfies Person;
    }
    case 'list': {
      const arr = Array.isArray(raw) ? raw : [];
      const max = field.max ?? LIMITS.listDefault;
      const items = arr.slice(0, max).map((entry, i) => {
        const obj = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const sub of field.item ?? []) out[sub.key] = cleanField(sub, obj[sub.key], `${path}[${i}].${sub.key}`, issues);
        return out;
      });
      // Drop rows where every required sub-field is blank — an empty row is a
      // half-filled form, not data.
      const required = (field.item ?? []).filter((f) => f.required).map((f) => f.key);
      return items.filter((row) => required.length === 0 || required.some((k) => String(row[k] ?? '').trim() !== ''));
    }
  }
}

/**
 * Takes whatever the browser sent for one section and returns exactly the
 * shape the fields describe: unknown keys dropped, strings trimmed and capped,
 * links checked, lists bounded. Issues are advisory — a section saves with
 * problems so the customer never loses typing — except that required cover
 * fields are enforced on publish, not here.
 */
export function cleanSection(fields: Field[], raw: unknown): { data: SectionData; issues: Issue[] } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const issues: Issue[] = [];
  const data: SectionData = {};
  for (const f of fields) data[f.key] = cleanField(f, obj[f.key], f.key, issues);
  return { data, issues };
}

/** What stops an invitation from being published. */
/**
 * The group a guest says they belong to, offered as a pull-down on the RSVP.
 * Every occasion gets a set in the words Filipino guests actually use, so a
 * couple who fills in nothing still gets a useful headcount sheet — sponsors
 * counted apart from officemates, the mother's side apart from the father's.
 * The couple can replace the whole list with their own; an occasion missing
 * from here asks nothing (a memorial does not sort its mourners, and a
 * corporate event asks for the department instead).
 *
 * Every celebration whose guests are the celebrant's peers carries their own
 * friends as well as their classmates: a child's playmates from the street are
 * not schoolmates, and the debutante's oldest friend may be in none of the 18s.
 *
 * Family and relative are both offered wherever either is. A tita or a cousin
 * reads "family" as the immediate one and hesitates over it, and a guest who
 * hesitates picks nothing — so the wider word sits right beside the narrow one
 * and neither of them has to decide what counts.
 */
export const GUEST_GROUP_PRESETS: Partial<Record<Occasion, string[]>> = {
  WEDDING: ['Principal sponsor (Ninong / Ninang)', 'Entourage', "Bride's family", "Bride's relative", "Groom's family", "Groom's relative", "Bride's friend", "Groom's friend", 'Officemate'],
  ENGAGEMENT: ["Bride-to-be's family", "Bride-to-be's relative", "Groom-to-be's family", "Groom-to-be's relative", "Bride-to-be's friend", "Groom-to-be's friend", 'Officemate'],
  CHRISTENING: ['Ninong / Ninang', "Mommy's family", "Mommy's relative", "Daddy's family", "Daddy's relative", "Mommy's friend", "Daddy's friend", 'Family friend'],
  COMMUNION: ['Ninong / Ninang', "Mommy's family", "Mommy's relative", "Daddy's family", "Daddy's relative", "Child's friend", 'Classmate / schoolmate', 'Family friend'],
  BABY_SHOWER: ["Mommy's family", "Mommy's relative", "Daddy's family", "Daddy's relative", "Mommy's friend", "Daddy's friend", 'Officemate'],
  KIDS_BIRTHDAY: ["Celebrant's family", "Celebrant's relative", 'Ninong / Ninang', "Celebrant's friend", 'Classmate / schoolmate', "Mommy's friend", "Daddy's friend", 'Neighbour'],
  MILESTONE_BIRTHDAY: ['Family', 'Relative', 'Ninong / Ninang', 'Friend', 'Officemate', 'Neighbour', 'Church / community'],
  DEBUT: ['Family', 'Relative', '18 Roses', '18 Candles', '18 Treasures', "Debutante's friend", 'Classmate / schoolmate', "Parents' guest"],
  ANNIVERSARY: ['Family', 'Relative', 'Ninong / Ninang', 'Friend', 'Officemate', 'Church / community'],
  GRADUATION: ['Family', 'Relative', "Graduate's friend", 'Classmate / schoolmate', 'Teacher / professor', 'Family friend'],
  HOUSEWARMING: ['Family', 'Relative', 'Friend', 'Officemate', 'Neighbour'],
  REUNION: ['Family', 'Relative', 'Batchmate / classmate', 'Friend'],
};

/**
 * The groups this invitation offers its guests: the couple's own list if they
 * wrote one, otherwise their occasion's. Empty means the question is not asked.
 */
export function guestGroups(occasion: Occasion, rsvp: SectionData | undefined): string[] {
  if (bool(rsvp, 'hideGroups')) return [];
  const own = rows<{ label: string }>(rsvp, 'groups').map((g) => g.label.trim()).filter(Boolean);
  return own.length ? own : (GUEST_GROUP_PRESETS[occasion] ?? []);
}

export function publishProblems(occasion: Occasion, content: Content): string[] {
  const problems: string[] = [];
  const cover = content.cover ?? {};
  for (const f of fieldsFor('cover', occasion)) {
    if (f.required && !String(cover[f.key] ?? '').trim()) problems.push(`Cover: ${f.label} is required.`);
  }
  // a motif is a set: four to eight colours. One started with fewer is not done;
  // none at all is a couple who chose not to show a palette, and that is allowed.
  const dress = content.dressCode;
  if (dress && sectionOffered('dressCode')) {
    for (const f of fieldsFor('dressCode', occasion)) {
      if ((f.type !== 'swatches' && f.type !== 'checks') || !f.min) continue;
      const n = Array.isArray(dress[f.key]) ? (dress[f.key] as unknown[]).length : 0;
      if (n > 0 && n < f.min) problems.push(`Dress code: pick at least ${f.min} ${f.type === 'swatches' ? 'colours' : 'choices'} for ${f.label.toLowerCase()} (${n} chosen).`);
    }
  }
  return problems;
}

/** Roughly, has the customer touched this section? Drives the progress bar. */
export function sectionFilled(key: SectionKey, occasion: Occasion, data: SectionData | undefined): boolean {
  if (!data) return false;
  const fields = fieldsFor(key, occasion);
  const meaningful = fields.filter((f) => f.type !== 'toggle' && f.type !== 'select');
  if (meaningful.length === 0) return true;
  return meaningful.some((f) => {
    const v = data[f.key];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Boolean((v as Person).name);
    return v !== '' && v !== null && v !== undefined;
  });
}

// ---------------------------------------------------------------------------
// Reading content
// ---------------------------------------------------------------------------

export function str(data: SectionData | undefined, key: string): string {
  const v = data?.[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function bool(data: SectionData | undefined, key: string): boolean {
  return data?.[key] === true;
}

export function num(data: SectionData | undefined, key: string): number | null {
  const v = data?.[key];
  return typeof v === 'number' ? v : null;
}

export function rows<T = Record<string, string>>(data: SectionData | undefined, key: string): T[] {
  const v = data?.[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export function personOf(data: SectionData | undefined, key: string): Person {
  const v = data?.[key];
  if (v && typeof v === 'object') return { title: '', name: '', deceased: false, ...(v as Partial<Person>) };
  return { title: '', name: '', deceased: false };
}

export function formatPerson(p: Person, lateWord = 'the late'): string {
  if (!p.name) return '';
  const name = [p.title, p.name].filter(Boolean).join(' ');
  return p.deceased ? `${lateWord} ${name} †` : name;
}

/** "Juan & Maria", "Sofia's 18th", "Baby Liam's Christening" — from the cover. */
export function displayTitle(occasion: Occasion, content: Content): string {
  const c = content.cover ?? {};
  const s = (k: string) => str(c, k);
  switch (occasion) {
    case 'WEDDING':
      return [s('brideFirst') || 'Bride', s('groomFirst') || 'Groom'].join(' & ');
    case 'DEBUT':
      return `${s('celebrantFirst') || 'Debutante'}'s 18th`;
    case 'CHRISTENING':
      return `${s('childNick') || s('childFull') || 'Baby'}'s Christening`;
    case 'COMMUNION':
      return `${s('childNick') || s('childFull') || 'Child'}'s First Communion`;
    case 'KIDS_BIRTHDAY':
    case 'MILESTONE_BIRTHDAY': {
      const age = num(c, 'age');
      return `${s('celebrantFirst') || 'Celebrant'}'s ${age ? ordinal(age) + ' ' : ''}Birthday`;
    }
    case 'BABY_SHOWER':
      return s('kind') === 'reveal' ? `${s('momName') || 'Baby'}'s Gender Reveal` : `${s('momName') || 'Baby'}'s Baby Shower`;
    case 'ANNIVERSARY':
      return `${s('partnerA') || 'A'} & ${s('partnerB') || 'B'} · ${num(c, 'years') ?? ''} Years`.replace(' ·  Years', '');
    case 'ENGAGEMENT':
      return `${s('partnerA') || 'A'} & ${s('partnerB') || 'B'}`;
    case 'GRADUATION':
      return s('honoree') || 'Graduation';
    case 'CORPORATE':
      return s('eventName') || s('company') || 'Company event';
    case 'HOUSEWARMING':
      return `${s('familyName') || 'Our'} House Blessing`;
    case 'REUNION':
      return s('groupName') || 'Reunion';
    case 'MEMORIAL':
      return `In loving memory of ${s('name') || ''}`.trim();
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** The event instant, from the cover's date and time, in Manila. */
export function eventInstant(content: Content): Date | null {
  const c = content.cover;
  const d = str(c, 'date');
  if (!d) return null;
  const t = str(c, 'time') || '00:00';
  const parsed = new Date(`${d}T${t}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function rsvpDeadline(content: Content): Date | null {
  const d = str(content.rsvp, 'deadline');
  if (!d) return null;
  const parsed = new Date(`${d}T23:59:59+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The photo used for the link preview: the cover, else the first gallery photo. */
export function coverImage(content: Content): string {
  return str(content.cover, 'coverPhoto') || rows(content.gallery, 'photos')[0]?.url || str(content.cover, 'photo') || '';
}
