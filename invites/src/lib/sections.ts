import type { Occasion, Tier } from '@prisma/client';
import { tierAtLeast } from './tiers';
import { GIFT_PRESETS, INTRO_PRESETS, POLICY_PRESETS, RSVP_NOTE_PRESETS, UNPLUGGED_PRESET, TITLES, type Lang, type Preset } from './copy';

/**
 * The shape of an invitation, section by section.
 *
 * One definition drives four things: the DIY builder's forms, the DFY intake
 * form, server-side validation of what either submits, and the renderer that
 * turns the JSON into a page. A field added here appears in all four; a field
 * that is not here cannot be stored. Every template renders this same shape,
 * so switching designs never loses data.
 */

export type Option = { value: string; label: string };

export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'time'
  | 'url'
  | 'number'
  | 'toggle'
  | 'image'
  | 'select'
  | 'colors'
  | 'person'
  | 'list';

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** select */
  options?: Option[];
  /** select: picking an option copies its text into this sibling field */
  presets?: Preset[];
  presetTarget?: string;
  /** list */
  item?: Field[];
  addLabel?: string;
  max?: number;
  /** Render full-width in a two-column form. */
  wide?: boolean;
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
const toggle = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'toggle', ...extra });
const number = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'number', ...extra });
const person = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, type: 'person', ...extra });
const select = (key: string, label: string, options: Option[], extra: Partial<Field> = {}): Field => ({ key, label, type: 'select', options, ...extra });
const list = (key: string, label: string, item: Field[], extra: Partial<Field> = {}): Field => ({ key, label, type: 'list', item, wide: true, ...extra });
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
  textarea('intro', 'Intro wording', { placeholder: 'Together with their families…' }),
  image('coverPhoto', 'Cover photo', { hint: 'Portrait works best on phones. This is also the preview image in Messenger and Viber.' }),
  ...(occasion === 'MEMORIAL' ? [] : [toggle('envelope', 'Animated envelope opening', { hint: 'Guests tap to open. Adds a little ceremony to the link.' })]),
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
    fields: () => [toggle('enabled', 'Show the countdown'), text('label', 'Label', { placeholder: 'Counting down to the big day' })],
  },
  {
    key: 'parents',
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
    description: 'Attire and up to five motif colours shown as swatches.',
    minTier: 'BASIC',
    labelFor: { KIDS_BIRTHDAY: 'Theme & attire' },
    fields: () => [
      select('attire', 'Guest attire', [
        { value: 'formal', label: 'Formal' },
        { value: 'semiFormal', label: 'Semi-formal' },
        { value: 'smartCasual', label: 'Smart casual' },
        { value: 'filipiniana', label: 'Filipiniana & Barong' },
        { value: 'cocktail', label: 'Cocktail' },
        { value: 'themed', label: 'Themed (describe below)' },
        { value: 'casual', label: 'Casual' },
      ]),
      text('attireText', 'Attire details', { placeholder: 'e.g. Long gown for ladies, suit for gentlemen' }),
      { key: 'colors', label: 'Colour motif', type: 'colors', max: 5, wide: true, hint: 'Up to five colours. Guests see them as swatches.' },
      toggle('avoidWhite', 'Ask guests to avoid white / off-white'),
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
      textarea('text', 'Gift note'),
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
      date('deadline', 'RSVP deadline', { hint: 'The form closes after this date on the Complete tier.' }),
      toggle('showSeats', 'Ask how many are coming'),
      toggle('collectAttendees', 'Ask for the names of those attending'),
      toggle('askDietary', 'Ask about allergies / dietary notes'),
      list('mealChoices', 'Meal choices (Complete tier)', [text('label', 'Choice', { required: true })], { addLabel: 'Add a choice', max: 6 }),
      select('policy', 'Policy', [{ value: 'none', label: 'No policy line' }, ...POLICY_PRESETS.map((p) => ({ value: p.key, label: p.label }))], { presets: POLICY_PRESETS, presetTarget: 'policyText' }),
      textarea('policyText', 'Policy wording'),
      select('notePreset', 'RSVP note', RSVP_NOTE_PRESETS.map((p) => ({ value: p.key, label: p.label })), { presets: RSVP_NOTE_PRESETS, presetTarget: 'note' }),
      textarea('note', 'RSVP note', { hint: '{n} becomes the reserved seats on a personal link; {date} the deadline.' }),
      ...(occasion === 'CORPORATE' ? [toggle('askDepartment', 'Ask for department / company')] : []),
      text('contactPhone', 'RSVP by text', { placeholder: 'Mobile number guests can text instead' }),
      textarea('reminderText', 'Reminder message', { hint: 'Used when you send RSVP reminders from the guest list.' }),
    ],
  },
  {
    key: 'story',
    label: 'Our story',
    tl: 'Ang Aming Kuwento',
    description: 'How you met, the proposal, and a timeline with photos.',
    minTier: 'STANDARD',
    labelFor: { MILESTONE_BIRTHDAY: 'Their story', ANNIVERSARY: 'Our story so far' },
    fields: () => [
      textarea('howWeMet', 'How we met'),
      textarea('proposal', 'The proposal'),
      list('timeline', 'Timeline', [text('date', 'When', { placeholder: 'June 2019' }), text('title', 'Title', { required: true }), textarea('text', 'Story'), image('photo', 'Photo')], { addLabel: 'Add a moment', max: 12 }),
    ],
  },
  {
    key: 'gallery',
    label: 'Gallery',
    tl: 'Mga Larawan',
    description: 'Prenup photos with captions, and a video link.',
    minTier: 'BASIC',
    fields: () => [
      list('photos', 'Photos', [image('url', 'Photo', { required: true }), text('caption', 'Caption')], { addLabel: 'Add a photo' }),
      url('videoUrl', 'Video link (Complete tier)', { hint: 'YouTube, Vimeo or a public Facebook video link.' }),
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
    label: 'FAQ',
    tl: 'Mga Paalala',
    description: 'Parking, kids, rain plan, shuttle, hashtag reminders.',
    minTier: 'STANDARD',
    fields: () => [list('items', 'Questions', [text('q', 'Question', { required: true }), textarea('a', 'Answer', { required: true })], { addLabel: 'Add a question', max: 20 })],
  },
  {
    key: 'travel',
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
      text('facebook', 'Facebook'),
      toggle('unplugged', 'Unplugged ceremony note'),
      textarea('unpluggedText', 'Wording', { placeholder: UNPLUGGED_PRESET.en }),
    ],
  },
  {
    key: 'music',
    label: 'Music',
    tl: 'Musika',
    description: 'A track that plays when guests tap play. Autoplay is attempted, then falls back to a button.',
    minTier: 'STANDARD',
    fields: () => [
      url('url', 'Audio file link', { hint: 'A direct .mp3 link. Upload it to your Google Drive (public) or Dropbox and paste the direct link.' }),
      text('title', 'Song title'),
      toggle('autoplay', 'Try to autoplay'),
    ],
  },
  {
    key: 'guestbook',
    label: 'Guestbook',
    tl: 'Mga Pagbati',
    description: 'A well-wishes wall guests can write on. You approve each message.',
    minTier: 'COMPLETE',
    fields: () => [toggle('enabled', 'Show the guestbook'), text('prompt', 'Prompt', { placeholder: 'Leave a message for the couple' }), toggle('moderated', 'Approve messages before they show')],
  },
  {
    key: 'photos',
    label: 'Guest photos',
    tl: 'Mga Larawan ng Bisita',
    description: 'A shared album your guests add to from their phones. You approve each photo before it appears.',
    minTier: 'COMPLETE',
    fields: () => [
      toggle('enabled', 'Let guests add photos'),
      text('prompt', 'Prompt', { placeholder: 'Share your photos from the day' }),
      toggle('moderated', 'Approve photos before they show'),
    ],
  },
  {
    key: 'closing',
    label: 'Closing',
    tl: 'Pagtatapos',
    description: 'A thank-you and your signature.',
    minTier: 'BASIC',
    fields: () => [textarea('message', 'Closing message'), text('signature', 'Signed', { placeholder: 'Juan & Maria' }), image('photo', 'Closing photo')],
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
    tl: 'Contact',
    description: 'Who guests can reach with questions.',
    minTier: 'BASIC',
    fields: () => [text('name', 'Name'), text('phone', 'Mobile'), text('email', 'Email'), text('messenger', 'Messenger link'), textarea('registrationNote', 'Registration note')],
  },
];

export const SECTION_BY_KEY: Record<SectionKey, SectionDef> = Object.fromEntries(SECTION_DEFS.map((s) => [s.key, s])) as Record<SectionKey, SectionDef>;

/** Which sections each occasion carries, in page order. */
export const OCCASION_SECTIONS: Record<Occasion, SectionKey[]> = {
  WEDDING: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'entourage', 'dressCode', 'gift', 'rsvp', 'story', 'gallery', 'program', 'faq', 'travel', 'social', 'music', 'guestbook', 'photos', 'closing'],
  DEBUT: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'eighteen', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'social', 'music', 'guestbook', 'photos', 'closing'],
  CHRISTENING: ['cover', 'countdown', 'parents', 'sponsors', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'music', 'guestbook', 'photos', 'closing'],
  KIDS_BIRTHDAY: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'program', 'gallery', 'faq', 'music', 'photos', 'closing'],
  MILESTONE_BIRTHDAY: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'story', 'gallery', 'program', 'faq', 'music', 'guestbook', 'photos', 'closing'],
  BABY_SHOWER: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'photos', 'closing'],
  ANNIVERSARY: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'story', 'gallery', 'program', 'faq', 'music', 'guestbook', 'photos', 'closing'],
  ENGAGEMENT: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'rsvp', 'gallery', 'faq', 'photos', 'closing'],
  GRADUATION: ['cover', 'countdown', 'parents', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'program', 'faq', 'photos', 'closing'],
  COMMUNION: ['cover', 'countdown', 'parents', 'sponsors', 'ceremony', 'reception', 'dressCode', 'gift', 'rsvp', 'gallery', 'faq', 'photos', 'closing'],
  CORPORATE: ['cover', 'countdown', 'reception', 'program', 'speakers', 'dressCode', 'rsvp', 'contact', 'faq', 'photos', 'closing'],
  HOUSEWARMING: ['cover', 'countdown', 'parents', 'ceremony', 'reception', 'rsvp', 'gift', 'faq', 'photos', 'closing'],
  REUNION: ['cover', 'countdown', 'parents', 'reception', 'program', 'rsvp', 'gallery', 'faq', 'contact', 'photos', 'closing'],
  MEMORIAL: ['cover', 'family', 'ceremony', 'reception', 'gift', 'rsvp', 'gallery', 'photos', 'closing'],
};

export function sectionsFor(occasion: Occasion): SectionDef[] {
  return OCCASION_SECTIONS[occasion].map((k) => SECTION_BY_KEY[k]);
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

export function fieldsFor(key: SectionKey, occasion: Occasion): Field[] {
  return SECTION_BY_KEY[key].fields(occasion);
}

// ---------------------------------------------------------------------------
// Defaults and validation
// ---------------------------------------------------------------------------

function emptyValue(field: Field): unknown {
  switch (field.type) {
    case 'toggle':
      return false;
    case 'number':
      return null;
    case 'colors':
      return [];
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
export function defaultContent(occasion: Occasion, lang: Lang = 'en'): Content {
  const content: Content = {};
  for (const def of sectionsFor(occasion)) {
    const data = emptySection(def.fields(occasion));
    switch (def.key) {
      case 'cover':
        data.introPreset = 'families';
        data.intro = '';
        data.envelope = true;
        if (occasion === 'WEDDING') data.kind = 'wedding';
        break;
      case 'countdown':
        data.enabled = true;
        break;
      case 'parents':
        if (occasion === 'WEDDING') data.phrasing = 'together';
        break;
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
      case 'music':
        data.autoplay = true;
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
    case 'text':
      return cleanString(raw, LIMITS.text);
    case 'textarea':
      return cleanString(raw, LIMITS.textarea);
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
      return cleanUrl(raw, path, issues);
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
    case 'colors': {
      const arr = Array.isArray(raw) ? raw : [];
      return arr
        .map((c) => cleanString(c, 7))
        .filter((c) => HEX.test(c))
        .slice(0, field.max ?? 5);
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
export function publishProblems(occasion: Occasion, content: Content): string[] {
  const problems: string[] = [];
  const cover = content.cover ?? {};
  for (const f of fieldsFor('cover', occasion)) {
    if (f.required && !String(cover[f.key] ?? '').trim()) problems.push(`Cover: ${f.label} is required.`);
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
