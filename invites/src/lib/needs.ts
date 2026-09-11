import type { Occasion } from '@prisma/client';
import { sectionLabel, type SectionKey } from './sections';
import { asksOf, fieldOf, askCounts } from './asks';
import {
  frameLists, pageRatio, valueAt, isPicture, LEGIBLE_CQW, ONE_SCREEN, BROWSER_BAR,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl,
} from './design';
import { contrast } from './palette';

/**
 * What a page still needs.
 *
 * The studio can draw anything; that is the point of it. What it cannot do
 * is tell whether what was drawn will hold up when a real customer's answers
 * arrive — a frame pointing at a field this occasion does not have, seven
 * frames for a list that allows six, a heading in English and nothing in
 * Tagalog. Those are not matters of taste. They are the ways a design breaks
 * quietly, on somebody's invitation, weeks later.
 *
 * So the design says them itself, in lines she can act on, each pointing at
 * the page and the element it is about. A line either **blocks** — it will
 * be wrong for somebody, and publishing it is publishing a fault — or it
 * merely **says**: worth knowing, hers to ignore.
 *
 * Everything here is read from the document, or from what the design's own
 * row already knows and hands in — the weight of each picture it uploaded,
 * whether it has a thumbnail. Nothing is measured in a browser and nothing
 * is fetched, so the studio keeps the list live as she draws and the publish
 * screen reads the same list from the same function. What genuinely needs a
 * browser — how the words actually wrap in five looks and two languages — is
 * not here and is not pretended.
 *
 * A rule that needs something the caller did not hand in stays quiet rather
 * than guessing. The weight of a file nobody recorded is not zero; it is
 * unknown, and a checklist that says "fine" about something it cannot see is
 * worse than one that says nothing.
 */

/**
 * Every line the checklist knows how to say.
 *
 * The list is the list, and the type is read off it, so a rule added here
 * and nowhere else fails the test that every one of them can be made to
 * fire. A checklist with a rule nobody has ever seen fire is a checklist
 * with a rule that does not work.
 */
export const NEED_RULES = [
  'ground',
  'carries-nothing',
  'off-page',
  'overlap',
  'unlinked',
  'too-many',
  'no-tagalog',
  'too-small',
  'orphan',
  'if-empty',
  'room',
  'browser-bar',
  'no-heading',
  'long-offer',
  'demo-blank',
  'ground-weight',
  'night-ink',
  'slot-lost',
  'no-thumbnail',
  'asks',
] as const;

export type NeedRule = (typeof NEED_RULES)[number];

export type Need = {
  /** blocks: it will be wrong for somebody. says: worth knowing, hers to ignore. */
  level: 'blocks' | 'says';
  rule: NeedRule;
  /** the page it is about, or empty for a line about the whole design */
  page: string;
  /** the element the line is about, so pressing it jumps there */
  id?: string;
  text: string;
};

type Look = {
  doc: DesignDoc | null;
  occasion: Occasion;
  content?: Record<string, unknown>;
  /**
   * What each picture this design uploaded weighs, by its address, straight
   * off the Media rows. A picture that has no row — the files the app ships
   * with — is not in here, and the weight rule says nothing about it.
   */
  weights?: Record<string, number>;
  /** what the row knows about the shop: whether it is shown there, and whether it has a cover */
  shop?: { shown: boolean; thumbnail: boolean };
};

/** A frame's box on the page, both axes as a share of the page's own height and width. */
type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Where a photo frame actually sits. `x` and `w` are shares of the width and
 * `y` a share of the height, so the frame's height has to cross over: its
 * aspect is measured against its own width, and the page is `ratio` widths
 * tall. A frame with no width of its own is the stylesheet's to place and is
 * not measured here.
 */
function boxOf(el: Element, ratio: number): Box | undefined {
  if (el.kind !== 'photo' || el.w === undefined || el.x === undefined) return undefined;
  const h = (el.w * ((el as PhotoEl).aspect ?? 1)) / ratio;
  const centred = (el.anchor ?? 'centre') === 'centre';
  return {
    left: el.x - el.w / 2,
    right: el.x + el.w / 2,
    top: centred ? el.y - h / 2 : el.y,
    bottom: centred ? el.y + h / 2 : el.y + h,
  };
}

const area = (b: Box) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  const small = Math.min(area(a), area(b));
  return small > 0 ? (w * h) / small : 0;
}

/** How much a frame may lie beyond the page before it is worth saying so. */
const BLEED = 2;
/**
 * How much two frames may cover each other before it is worth saying so.
 *
 * Frames that lean on one another are a style, not a mistake — Baby Blue's
 * four polaroids are scattered and touching on purpose — so the line is
 * drawn where one frame is eating most of another rather than resting on it.
 */
const COVERED = 0.45;

/**
 * How heavy a page's background may be before a guest on mobile data feels
 * it. The ten backgrounds the app ships with are 50 to 103 kB each; a page
 * exported straight out of a design tool as a PNG is two to four megabytes,
 * and a guest scrolling an invitation waits for every one of them.
 */
export const HEAVY_GROUND = 400 * 1024;

/**
 * Night, as the stylesheet actually does it.
 *
 * At night the words are drawn in a pale cream and a picture behind them is
 * turned down to under a half. A ground named by one of the six roles turns
 * down with everything else; a colour of her own is painted exactly as she
 * gave it and does not, which is the whole reason these two numbers are
 * here. And the grey a frame shows while it waits for a photograph is fixed
 * in both modes, so it is the one thing on the page that cannot be relied on
 * to move with the ground.
 */
const NIGHT_INK = '#f1e9dd';
const WAITING_SLOT = '#e8e3dd';
/** Where a heading stops being comfortable to read. The standards' own number. */
const READABLE = 3;
/** Close enough to the same colour that a frame waiting for a photo is lost in the page. */
const SAME_COLOUR = 1.3;

/** The name a line calls an element: its own word for it, or its id. */
function nameOf(el: Element, n: number): string {
  if (el.kind === 'photo') return `Frame ${n}`;
  if (el.kind === 'text') {
    const role = (el as TextEl).lines[0]?.role;
    if (role === 'title' || role === 'script') return 'This heading';
    if (role === 'caption') return 'This caption';
    if (role === 'label-title' || role === 'label-text') return 'This label';
  }
  return 'This box';
}

export function pageNeeds({ doc, occasion, content, weights, shop }: Look): Need[] {
  if (!doc) return [];
  const out: Need[] = [];
  const asks = asksOf(doc, occasion);
  const lists = frameLists(doc);

  for (const page of doc.pages) {
    const say = (level: Need['level'], rule: NeedRule, text: string, id?: string) =>
      out.push({ level, rule, page: page.key, text, ...(id ? { id } : {}) });
    const named = page.label?.en || page.key;
    const elements = page.elements ?? [];
    const frames = elements.filter((e) => e.kind === 'photo');
    const ratio = pageRatio(page);

    // --- the page itself ----------------------------------------------------

    if (page.drawn && !page.ground) say('blocks', 'ground', `${named} has no background yet.`);
    if (!page.drawn && page.sections.length === 0) {
      say('says', 'carries-nothing', `${named} carries nothing, so it is never drawn.`);
    }
    if (page.drawn && elements.length && !elements.some((e) => e.kind === 'text' && (e as TextEl).block === 'head')) {
      say('says', 'no-heading', `${named} has no heading.`);
    }
    /*
     * What the background weighs. Only ever said about a picture this design
     * uploaded, because those are the ones somebody chose and can choose
     * again: a ground cut in three is the sum of its cuts, since a guest
     * fetches all of them.
     */
    if (page.ground && isPicture(page.ground) && weights) {
      const parts = [page.ground.url, ...(page.ground.slices ? [page.ground.slices.top, page.ground.slices.mid, page.ground.slices.foot] : [])];
      const bytes = parts.reduce((sum, url) => sum + (weights[url] ?? 0), 0);
      if (bytes > HEAVY_GROUND) {
        say('says', 'ground-weight', `${named}'s background is ${Math.round(bytes / 1024)} kB. A guest on mobile data waits for every page's background, so keep one under ${Math.round(HEAVY_GROUND / 1024)} kB — saved as WebP rather than PNG it usually is.`);
      }
    }
    /*
     * A ground she typed rather than named. A role colour turns itself down
     * at night with the ink; a colour of her own keeps exactly the colour
     * she gave it while the ink turns pale, so pale ground and pale ink meet
     * and the words go. Words with a backing carry their own halo and are
     * fine, so the line only fires where something on the page has none.
     */
    if (page.ground && !isPicture(page.ground) && page.ground.color.startsWith('#')) {
      const ground = page.ground.color;
      const bare = elements.filter((e) => e.kind === 'text' && ((e as TextEl).backing ?? 'none') === 'none');
      if (bare.length && contrast(ground, NIGHT_INK) < READABLE) {
        say('says', 'night-ink', `${named} is a colour of your own, so it stays ${ground} at night while the words turn pale — they will be hard to read. A role colour turns itself down with them, or give the words a backing.`, bare[0].id);
      }
      if (frames.length && contrast(ground, WAITING_SLOT) < SAME_COLOUR) {
        say('says', 'slot-lost', `${named}'s frames show a fixed pale grey while they wait for a photograph, and on ${ground} that is nearly the page itself: an empty frame will not be visible.`, frames[0].id);
      }
    }

    // --- every element ------------------------------------------------------

    frames.forEach((el, i) => {
      const box = boxOf(el, ratio);
      if (!box) return;
      const over = Math.max(BLEED - box.left, box.right - (100 + BLEED), BLEED - box.top, box.bottom - (100 + BLEED));
      const centreOff = el.x! < 0 || el.x! > 100 || el.y < 0 || el.y > 100;
      if (centreOff) say('blocks', 'off-page', `${nameOf(el, i + 1)} sits off the page.`, el.id);
      else if (over > 0) say('says', 'off-page', `${nameOf(el, i + 1)} sits partly off the page.`, el.id);
    });

    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const a = boxOf(frames[i], ratio);
        const b = boxOf(frames[j], ratio);
        if (!a || !b) continue;
        if (overlap(a, b) > COVERED) {
          say('says', 'overlap', `Frames ${i + 1} and ${j + 1} overlap.`, frames[j].id);
        }
      }
    }

    elements.forEach((el, i) => {
      // a frame that is neither the design's own picture nor anybody's answer
      if (el.kind === 'photo') {
        const bind = (el as PhotoEl).bind;
        const blank = 'asset' in bind ? !bind.asset : false;
        // Asked for and still blank is its own fault, and a quieter one: the
        // form is built from the field a frame names, so a frame that names
        // none asks the customer for nothing and stays empty on every
        // invitation. It is the state a page imported from Canva starts in.
        if (blank) {
          say('blocks', 'unlinked', el.ask
            ? `Frame ${frames.indexOf(el) + 1} is asked for but does not say which field, so the form will not ask for it.`
            : `Frame ${frames.indexOf(el) + 1} is not linked to anything.`, el.id);
        }
      }
      if (el.kind === 'text') {
        const t = el as TextEl;
        // A fixed line written in English with no Tagalog beside it. An empty
        // `tl` is how a design says "English only, on purpose", so it passes.
        for (const line of t.lines) {
          for (const src of line.sources) {
            if ('fixed' in src && src.fixed.en.trim() && src.fixed.tl === undefined) {
              say('blocks', 'no-tagalog', `${nameOf(el, i + 1)} has English but no Tagalog.`, el.id);
            }
          }
        }
        /*
         * A line offered to the customer as a starting point, longer than
         * the room this very box holds. They tap it and the counter goes
         * red on words the design gave them, which is the design arguing
         * with itself in front of a customer.
         */
        if (t.offerLine && t.room) {
          for (const line of t.lines) {
            for (const src of line.sources) {
              if (!('fixed' in src)) continue;
              const longest = Math.max(src.fixed.en.trim().length, src.fixed.tl?.trim().length ?? 0);
              if (longest > t.room) {
                say('says', 'long-offer', `${nameOf(el, i + 1)} offers ${longest} letters as an example, and the box holds about ${t.room}.`, el.id);
              }
            }
          }
        }
        const sizes = [t.size, ...t.lines.map((l) => l.size)].filter((s): s is number => s !== undefined);
        if (sizes.some((s) => s < LEGIBLE_CQW)) {
          say('blocks', 'too-small', `${nameOf(el, i + 1)} is too small to read on a phone.`, el.id);
        }
      }
      // the foot of a page drawn to a screen or less is under the browser's bar
      if (page.drawn && ratio <= ONE_SCREEN + 0.02 && el.y > ((ratio - BROWSER_BAR) / ratio) * 100) {
        say('says', 'browser-bar', `${nameOf(el, i + 1)} sits under the phone's browser bar until the guest scrolls.`, el.id);
      }
    });
  }

  // --- what the design asks for ---------------------------------------------

  for (const a of asks) {
    if (a.orphan) {
      say(out, a, 'says', 'orphan', `${a.label} is a field ${occasionWord(occasion)} does not have; it stays empty there.`);
      continue;
    }
    if (a.kind === 'photo' && !a.ifEmpty) {
      say(out, a, 'says', 'if-empty', `${a.label} is asked for but has nothing to show when it is left empty.`);
    }
    const field = fieldOf(a.ref, occasion);
    if (a.room && field?.max && field.max > a.room) {
      say(out, a, 'says', 'room', `${a.label}: the box fits about ${a.room} letters; the question on the form still asks for ${field.max}.`);
    }
    if (content && a.kind === 'photo' && !valueAt(content, a.ref)) {
      say(out, a, 'says', 'demo-blank', `The demo has nothing for ${a.label}.`);
    }
  }

  // a list drawn more times than the occasion allows
  for (const list of lists) {
    const field = fieldOf({ section: list.section, field: list.field }, occasion);
    if (field?.max && list.count > field.max) {
      out.push({
        level: 'blocks',
        rule: 'too-many',
        page: list.page,
        text: `${sectionLabel(list.section as SectionKey, occasion)} allows up to ${field.max} on ${occasionWord(occasion)}; this page has ${list.count} frames.`,
      });
    }
  }

  /*
   * A design in the shop with no cover. Blank is not broken — the gallery
   * card falls back to the design's own colours, which is deliberate — but
   * a card of colours beside cards of covers is the one nobody taps.
   */
  if (shop && shop.shown && !shop.thumbnail) {
    out.push({
      level: 'says',
      rule: 'no-thumbnail',
      page: '',
      text: 'This design is shown in the shop with no thumbnail, so its card there is its colours rather than its cover.',
    });
  }

  const counts = askCounts(asks);
  if (counts.photos || counts.writings) {
    out.push({
      level: 'says',
      rule: 'asks',
      // about the design, not about any one page
      page: '',
      text: `This design asks for ${counts.photos} photograph${counts.photos === 1 ? '' : 's'} and ${counts.writings} writing${counts.writings === 1 ? '' : 's'}.`,
    });
  }

  return out;
}

function say(out: Need[], a: { page: string; id: string }, level: Need['level'], rule: NeedRule, text: string) {
  out.push({ level, rule, page: a.page, id: a.id, text });
}

/** The occasion as it reads in a sentence: "on a christening". */
const OCCASION_WORD: Partial<Record<Occasion, string>> = {
  WEDDING: 'a wedding',
  DEBUT: 'a debut',
  CHRISTENING: 'a christening',
  KIDS_BIRTHDAY: "a child's birthday",
  MILESTONE_BIRTHDAY: 'a milestone birthday',
  BABY_SHOWER: 'a baby shower',
  ANNIVERSARY: 'an anniversary',
  ENGAGEMENT: 'an engagement',
  GRADUATION: 'a graduation',
  COMMUNION: 'a communion',
};
function occasionWord(occasion: Occasion): string {
  return OCCASION_WORD[occasion] ?? 'this occasion';
}

/** What a page still needs, counted the way the page strip shows it. */
export function needCount(needs: Need[], page?: string): { blocks: number; says: number } {
  const mine = page ? needs.filter((n) => n.page === page) : needs;
  return { blocks: mine.filter((n) => n.level === 'blocks').length, says: mine.filter((n) => n.level === 'says').length };
}

/** Whether a design is clean enough to publish: no line that says it is wrong. */
export const publishable = (needs: Need[]): boolean => !needs.some((n) => n.level === 'blocks');

/** Kept here so the studio and the Templates list agree on what "a picture" means. */
export const hasGround = (page: PageSpec): boolean => Boolean(page.ground && (isPicture(page.ground) || page.ground.color));
