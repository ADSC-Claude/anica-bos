import type { Occasion } from '@prisma/client';
import { sectionLabel, type SectionKey } from './sections';
import { asksOf, fieldOf, askCounts } from './asks';
import {
  frameLists, pageRatio, valueAt, isPicture, LEGIBLE_CQW, ONE_SCREEN, BROWSER_BAR,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl,
} from './design';

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
 * Everything here is read from the document. Nothing is measured in a
 * browser and nothing is fetched, so the studio keeps the list live as she
 * draws and the publish screen reads the same list from the same function.
 * What genuinely needs a browser (how the words actually wrap in five looks,
 * a background's weight in kilobytes) is not here and is not pretended.
 */

export type NeedRule =
  | 'ground'
  | 'carries-nothing'
  | 'off-page'
  | 'overlap'
  | 'unlinked'
  | 'too-many'
  | 'no-tagalog'
  | 'too-small'
  | 'orphan'
  | 'if-empty'
  | 'room'
  | 'browser-bar'
  | 'no-heading'
  | 'demo-blank'
  | 'asks';

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

type Look = { doc: DesignDoc | null; occasion: Occasion; content?: Record<string, unknown> };

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

export function pageNeeds({ doc, occasion, content }: Look): Need[] {
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
        if (blank && !el.ask) say('blocks', 'unlinked', `Frame ${frames.indexOf(el) + 1} is not linked to anything.`, el.id);
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
