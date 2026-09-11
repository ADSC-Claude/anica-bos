import type { Occasion } from '@prisma/client';
import { str, num, rows, type Content } from './sections';
import { formatTime } from './datetime';

/**
 * The check-in pass: the screen a guest holds up at the door.
 *
 * It is not the invitation. The invitation is read at home, days before, and
 * it is long; this is read by somebody standing in a doorway holding a gift,
 * and it has one job — be the thing that gets scanned. So it carries the
 * names, the code, and the two or three details that answer what a guest asks
 * on the threshold: which table, what is the hashtag, when does the programme
 * start.
 *
 * Deliberately free of `server-only` and of Prisma: it is copy and selection,
 * and the words a guest reads ought to be testable without a database.
 */

export type PassCopy = {
  /** The line above the names. */
  intro: string;
  /** The call beside the code. */
  cta: string;
  /** The line under it, in the couple's voice rather than a form's. */
  note: string;
};

const SCAN = 'Scan to Check In';

/**
 * Why the note never says "scan this yourself".
 *
 * The door desk does the scanning — that is what keeps the arrival count worth
 * having, because a code a guest can scan is a code a guest can scan from home
 * a week early. So the guest's instruction is to *show* it, and the wording
 * says so plainly rather than asking them to do something the app will not let
 * them do.
 */
export const PASS_COPY: Record<Occasion, PassCopy> = {
  WEDDING: {
    intro: 'Welcome to the Wedding of',
    cta: SCAN,
    note: 'Kindly show this on arrival to confirm your attendance and receive your table assignment.',
  },
  DEBUT: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'Please show this at the door. The programme begins promptly — we would hate for you to miss the entrance.',
  },
  CHRISTENING: {
    intro: 'Welcome to the Christening of',
    cta: SCAN,
    note: 'Please show this at the door, at the church and again at the reception.',
  },
  COMMUNION: {
    intro: 'Welcome to the First Communion of',
    cta: SCAN,
    note: 'Please show this at the door, at the church and again at the reception.',
  },
  KIDS_BIRTHDAY: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'We are excited to celebrate with you! Please show this when you arrive.',
  },
  MILESTONE_BIRTHDAY: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'We are excited to celebrate with you! Please show this when you arrive.',
  },
  ANNIVERSARY: {
    intro: 'Celebrating',
    cta: SCAN,
    note: 'Please show this on arrival. Thank you for being part of these years.',
  },
  ENGAGEMENT: {
    intro: 'Welcome to the Engagement Party of',
    cta: SCAN,
    note: 'Please show this when you arrive.',
  },
  BABY_SHOWER: {
    intro: 'Welcome to the Baby Shower for',
    cta: SCAN,
    note: 'Please show this when you arrive.',
  },
  GRADUATION: {
    intro: 'Welcome to the Graduation of',
    cta: SCAN,
    note: 'Please show this at the door to confirm your seat.',
  },
  CORPORATE: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'Please present this at registration. Your badge and session details follow.',
  },
  HOUSEWARMING: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'Please show this when you arrive.',
  },
  REUNION: {
    intro: 'Welcome to',
    cta: SCAN,
    note: 'Please show this when you arrive.',
  },
  MEMORIAL: {
    intro: 'In loving memory of',
    cta: 'Scan on arrival',
    // No exclamation, no welcome, no "excited". The same mechanism, and none
    // of the same register.
    note: 'Please show this to the family or to an usher on arrival.',
  },
};

/** The line above the names, with the number filled in where there is one. */
export function passIntro(occasion: Occasion, content: Content): string {
  const base = PASS_COPY[occasion].intro;
  if (occasion !== 'ANNIVERSARY') return base;
  const years = num(content.cover ?? {}, 'years');
  return years ? `Celebrating ${years} Years of Love` : 'Celebrating';
}

/**
 * The name under the intro line.
 *
 * Usually the invitation's own display title, but not where the intro has
 * already said the occasion: "Welcome to the Christening of" above "Baby Noah
 * James's Christening" says it twice, which is the sort of thing nobody
 * notices in a spec and everybody notices on a card. Those occasions get the
 * bare name, which is what the line is asking for.
 */
export function passSubject(occasion: Occasion, content: Content, fallback: string): string {
  const c = content.cover ?? {};
  const first = (...keys: string[]) => {
    for (const k of keys) {
      const v = str(c, k);
      if (v) return v;
    }
    return '';
  };
  switch (occasion) {
    case 'CHRISTENING':
    case 'COMMUNION':
      return first('childNick', 'childFull') || fallback;
    case 'GRADUATION':
      return first('celebrantFirst', 'celebrantFull', 'graduateFirst') || fallback;
    case 'BABY_SHOWER':
      return first('celebrantFirst', 'motherFirst', 'parentFirst') || fallback;
    case 'ENGAGEMENT':
      return [first('brideFirst', 'partnerA'), first('groomFirst', 'partnerB')].filter(Boolean).join(' & ') || fallback;
    case 'MEMORIAL':
      return first('nameFull', 'name', 'celebrantFull') || fallback;
    default:
      return fallback;
  }
}

/**
 * How the pass is laid out, which is the same question as where the code sits.
 *
 * The photograph is never washed out and never darkened. The type never sits
 * on it either — it sits on paper, which is what makes both of those
 * unnecessary. A code needs pale paper under it or a phone cannot read it, so
 * the code gets a piece of paper and the picture keeps its strength all round
 * it. That is the whole idea, and the three are three places to put it.
 */
export type PassLook = 'photo' | 'split' | 'ground';

export const PASS_LOOKS: readonly { value: PassLook; label: string; note: string }[] = [
  { value: 'photo', label: 'Your photo behind', note: 'The picture fills the pass and the code sits on a card over it.' },
  { value: 'split', label: 'Photo above the code', note: 'The picture across the top, the code on your own paper beneath it.' },
  { value: 'ground', label: 'Your invitation’s design', note: 'The design’s own background, carried through to the door.' },
];

/**
 * Blank is the photograph, and so are the two photo backdrops the old picker
 * offered: a couple who chose "photo behind the card" or "photo behind the
 * code" asked for their picture behind their code. Only the invitation's own
 * colours map to `ground`.
 */
export function passLookFrom(raw: string): PassLook {
  if (raw === 'ground') return 'ground';
  return PASS_LOOKS.some((l) => l.value === raw) ? (raw as PassLook) : 'photo';
}

export type PassDetail = { label: string; value: string };

/**
 * The two or three things a guest asks in a doorway.
 *
 * Every one of these is already somewhere on the invitation — the hashtag in
 * the social section, the programme in the programme, the godparents in the
 * sponsors. Nothing here is a new question to answer in the builder; a couple
 * who filled their invitation in has already filled this in. What is missing
 * is simply left out, which is why the list is built rather than declared.
 */
export function passDetails(occasion: Occasion, content: Content, guest: { table: { name: string } | null; groupName: string }): PassDetail[] {
  const out: PassDetail[] = [];
  const add = (label: string, value: string | number | undefined | null) => {
    const v = String(value ?? '').trim();
    if (v) out.push({ label, value: v });
  };

  const programme = rows<{ time: string; title: string }>(content.program ?? {}, 'items');
  const starts = programme.find((r) => str(r, 'time'))?.time ?? '';
  const startsAt = starts ? formatTime(starts) || starts : '';

  // The table comes first wherever there is one: it is the question the whole
  // pass exists to answer.
  if (guest.table) add('Table', guest.table.name);

  switch (occasion) {
    case 'WEDDING':
    case 'ENGAGEMENT':
      add('Hashtag', str(content.social ?? {}, 'hashtag'));
      add('Registry', rows<{ label: string }>(content.gift ?? {}, 'registry')[0]?.label);
      break;
    case 'KIDS_BIRTHDAY':
    case 'MILESTONE_BIRTHDAY':
      add('Theme', str(content.cover ?? {}, 'theme'));
      add('Programme starts', startsAt);
      break;
    case 'CHRISTENING':
    case 'COMMUNION':
      add('Reception', str(content.reception ?? {}, 'venue'));
      add('Godparents', godparents(content));
      break;
    case 'DEBUT': {
      const roses = rows(content.eighteen ?? {}, 'roses').length;
      const candles = rows(content.eighteen ?? {}, 'candles').length;
      if (roses) add('18 Roses', `${roses} named`);
      if (candles) add('18 Candles', `${candles} named`);
      add('Programme starts', startsAt);
      break;
    }
    case 'ANNIVERSARY':
      add('Married', marriedSince(content));
      add('Hashtag', str(content.social ?? {}, 'hashtag'));
      break;
    case 'CORPORATE':
      add('Session', guest.groupName);
      add('Programme starts', startsAt);
      add('Badge', 'Printed at registration');
      break;
    default:
      add('Programme starts', startsAt);
      add('Hashtag', str(content.social ?? {}, 'hashtag'));
  }
  return out;
}

/** "Ninong Fred, Ninang Let and 4 others" — a list a doorway can read. */
function godparents(content: Content): string {
  const names = [...rows<{ name: string }>(content.sponsors ?? {}, 'ninongs'), ...rows<{ name: string }>(content.sponsors ?? {}, 'ninangs')]
    .map((r) => str(r, 'name'))
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= 2) return names.join(' and ');
  return `${names[0]}, ${names[1]} and ${names.length - 2} ${names.length - 2 === 1 ? 'other' : 'others'}`;
}

function marriedSince(content: Content): string {
  const years = num(content.cover ?? {}, 'years');
  return years ? `${years} years` : '';
}

/**
 * What a guest is told once the desk has scanned them.
 *
 * Three states and no fourth: they have not arrived, they have, or they said
 * they were not coming and turned up anyway — which happens, and which the
 * door should greet rather than argue with.
 */
export function arrivalLine(name: string, checkedIn: boolean, declined: boolean): { title: string; body: string } {
  const first = name.split(' ')[0] || name;
  if (checkedIn) {
    return { title: `Welcome, ${name}.`, body: `You are checked in, ${first}. Everything below is yours for the rest of the day.` };
  }
  if (declined) {
    return { title: `Welcome, ${name}.`, body: 'Your reply said you could not make it, so there may not be a seat set aside — show this to the desk and they will sort it out.' };
  }
  return { title: `Welcome, ${name}.`, body: 'Show this screen at the door and we will scan you in.' };
}

/**
 * What opens up once somebody is through the door.
 *
 * None of it is on the front of the pass. Before the scan the pass has one
 * job — be the thing that gets scanned — and a screen offering a guestbook and
 * a photo album to somebody standing in a queue is a screen that gets read
 * instead of held up. After the scan the queue is behind them and the same
 * phone becomes the thing they use for the rest of the day.
 *
 * Each one is gated on what the couple actually bought, and the seat is gated
 * twice over: an invitation may carry seating and still have set no tables.
 */
export type ArrivedLink = { href: string; label: string; note: string };

export function arrivedLinks(
  url: string,
  opts: { table: string; seating: boolean; guestbook: boolean; programme: boolean; photos: boolean },
): ArrivedLink[] {
  const out: ArrivedLink[] = [];
  if (opts.seating && opts.table) {
    out.push({ href: `${url}#rsvp`, label: opts.table, note: 'Your table' });
  }
  if (opts.programme) {
    out.push({ href: `${url}#program`, label: 'What happens when', note: 'The programme' });
  }
  if (opts.guestbook) {
    out.push({ href: `${url}#guestbook`, label: 'Leave them a message', note: 'Guestbook' });
  }
  if (opts.photos) {
    out.push({ href: `${url}#photos`, label: 'Add your photographs', note: 'Shared album' });
  }
  return out;
}
