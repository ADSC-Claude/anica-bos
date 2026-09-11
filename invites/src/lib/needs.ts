import type { Occasion } from '@prisma/client';
import { sectionLabel, type SectionKey } from './sections';
import { asksOf, fieldOf, askCounts } from './asks';
import {
  frameLists, pageRatio, valueAt, isPicture, flowDecor, moves, LEGIBLE_CQW, ONE_SCREEN, BROWSER_BAR,
  type DesignDoc, type PageSpec, type Element, type PhotoEl, type TextEl, type VideoEl,
} from './design';
import { contrast } from './palette';
import { GLARE, HEAVY_CLIP_BYTES, LONG_CLIP_MS, VIDEO_BUDGET_BYTES, VIDEO_BUDGET_LABEL } from './clips';
import { HEAVY_MOVING_BYTES } from './moving';

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
  'clip-weight',
  'clip-length',
  'clip-budget',
  'clip-glare',
  'not-drawn',
  'moving',
  'motion',
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
  /**
   * How long each clip runs, in milliseconds, by its address — the same
   * Media rows as `weights`, which is where the browser's reading of the
   * file was written down. A clip with no row is unknown rather than short.
   */
  lengths?: Record<string, number>;
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
  // A clip behind the whole page is the whole page, whatever numbers it
  // happens to carry: the stylesheet places it, not the document.
  if (el.kind === 'video' && (el as VideoEl).bg) return { left: 0, right: 100, top: 0, bottom: 100 };
  // Otherwise a clip is placed exactly as a frame is — its own width, its
  // own proportion — so the same maths gives its box and nothing is
  // duplicated.
  if ((el.kind !== 'photo' && el.kind !== 'video') || el.w === undefined || el.x === undefined) return undefined;
  const h = (el.w * ((el as PhotoEl | VideoEl).aspect ?? 1)) / ratio;
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
/** How many things may move on one page before the page is merely busy. */
export const MOST_MOVING = 5;
const WAITING_SLOT = '#e8e3dd';
/** Where a heading stops being comfortable to read. The standards' own number. */
const READABLE = 3;
/** Close enough to the same colour that a frame waiting for a photo is lost in the page. */
const SAME_COLOUR = 1.3;

/** The name a line calls an element: its own word for it, or its id. */
function nameOf(el: Element, n: number): string {
  if (el.kind === 'photo') return `Frame ${n}`;
  if (el.kind === 'video') return 'This clip';
  if (el.kind === 'text') {
    const role = (el as TextEl).lines[0]?.role;
    if (role === 'title' || role === 'script') return 'This heading';
    if (role === 'caption') return 'This caption';
    if (role === 'label-title' || role === 'label-text') return 'This label';
  }
  return 'This box';
}

export function pageNeeds({ doc, occasion, content, weights, lengths, shop }: Look): Need[] {
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
     * How much of the page moves at once.
     *
     * Not a performance line — a browser animates a dozen small things
     * without noticing. It is about reading: a guest's eye goes to whatever
     * is moving, and when six things are moving there is nowhere for it to
     * land. Five is the number the plan set, and a page over it is saying
     * everything is important, which is the same as saying nothing is.
     */
    const moving = elements.filter(moves);
    if (moving.length > MOST_MOVING) {
      say('says', 'motion', `${moving.length} things move on ${named} at once. A guest's eye goes to whatever moves, and past about ${MOST_MOVING} there is nowhere for it to land — the page reads as busy rather than alive.`, moving[MOST_MOVING].id);
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

    /*
     * Off the page, and one frame on top of another.
     *
     * Both are answers about a box, and a box needs a height. A drawn page
     * has one — it is the ground's proportion — so these are measured there
     * and only there. A page laid out by its words has no height until a
     * customer has written; its decorations hang off an edge by a share of
     * its *width* and its floats have no place at all, so the vertical
     * question cannot be asked, and asking it anyway would fire on every
     * decoration ever made. What can still be said is the horizontal, which
     * is a share of the width on both kinds of page.
     */
    if (page.drawn) {
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
    } else {
      // the width is a share of the width on either kind of page
      flowDecor(page).forEach((el, i) => {
        if (el.x === undefined || el.w === undefined) return;
        const left = el.x - el.w / 2;
        const right = el.x + el.w / 2;
        if (el.x < 0 || el.x > 100) say('blocks', 'off-page', `${nameOf(el, i + 1)} sits off the side of the page.`, el.id);
        else if (left < -BLEED || right > 100 + BLEED) say('says', 'off-page', `${nameOf(el, i + 1)} runs off the side of the page.`, el.id);
      });
      // words on a page laid out by its words are its sections', so a text
      // box here is in the document and drawn nowhere
      for (const el of elements) {
        if (el.kind === 'text') {
          say('blocks', 'not-drawn', `${named} is laid out by its words, so its words come from the sections it carries — ${nameOf(el, elements.indexOf(el) + 1)} is never drawn. Put it on a page drawn by hand, or say it in the section's own line.`, el.id);
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
      /*
       * A moving picture: a GIF, an animated WebP, an animated PNG.
       *
       * Two things are worth saying about one, and both come from the same
       * fact: it is never re-encoded. Nothing resizes it, so its weight is
       * the weight every guest downloads — and a frame the *customer* fills
       * must never carry the flag, or their four-thousand-pixel photograph
       * would be served whole to every guest as well, which is the one way
       * this can go wrong quietly.
       */
      if (el.kind === 'photo' && (el as PhotoEl).animated) {
        const moving = el as PhotoEl;
        const name = nameOf(el, i + 1);
        if (!('asset' in moving.bind)) {
          say('blocks', 'moving', `${name} is marked as a moving picture but reads a field the customer fills. A moving picture is the design's own — a customer's photograph would be served at whatever size they uploaded, to every guest. Point it at a piece from the library, or take the mark off.`, el.id);
        }
        const bytes = weights?.[('asset' in moving.bind ? moving.bind.asset : '')];
        if (bytes !== undefined && bytes > HEAVY_MOVING_BYTES) {
          say('says', 'moving', `${name} is ${Math.round(bytes / 1024)} kB. A moving picture is never resized or re-encoded, so every guest downloads it whole: under ${Math.round(HEAVY_MOVING_BYTES / 1024)} kB is what a phone on mobile data has before they scroll to it. Fewer frames or a smaller export is the only way down.`, el.id);
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
      if (el.kind === 'video') {
        const clip = el as VideoEl;
        const name = nameOf(el, i + 1);
        /*
         * A clip with nothing behind it. The poster is what prints, what a
         * guest sparing their data is served, and what a phone in Low Power
         * Mode shows instead of playing — three people who never see the
         * clip at all. An empty box for all three is not a style.
         */
        if (!clip.poster) say('blocks', 'clip-glare', `${name} has no still behind it, so it is an empty box for anyone who prints the page, spares their data, or has Low Power Mode on.`, el.id);
        /*
         * What one clip weighs, said where there is still room to act on it.
         * Only ever about a clip this design uploaded, for the same reason
         * as a background: those are the ones somebody chose and can choose
         * again. Unknown is not light.
         */
        const bytes = weights?.[clip.url];
        if (bytes !== undefined && bytes > HEAVY_CLIP_BYTES) {
          say('says', 'clip-weight', `${name} is ${Math.round(bytes / 1024 / 1024 * 10) / 10} MB. Every guest downloads it whole, and there is no transcoding on this side, so a shorter cut or a smaller export is the only way down.`, el.id);
        }
        const ms = lengths?.[clip.url];
        if (ms !== undefined && ms > LONG_CLIP_MS) {
          say('says', 'clip-length', `${name} runs ${Math.round(ms / 1000)} seconds. Past about ${LONG_CLIP_MS / 1000} a guest has scrolled on and the rest was downloaded for nobody.`, el.id);
        }
        /*
         * Words laid straight onto a moving picture.
         *
         * `glare` is the brightest area the studio saw while it was choosing
         * the poster — across every frame it decoded, not only the one it
         * kept, because the frame that swallows a pale letter is often
         * seconds after the frame worth printing. A backing carries its own
         * halo and is fine either way, so only bare words are counted.
         *
         * It is a sample and the line says so. Nothing short of decoding
         * every frame could promise otherwise, and a checklist that promised
         * it would be lying on the one page where it matters.
         */
        /*
         * On a page laid out by its words there is nothing to measure and
         * nothing to measure against: the words are its sections', they run
         * down the whole column, and a clip filling the page is behind all
         * of them. So the question is not which box lands on which — it is
         * simply whether the clip goes pale, and the answer is about the
         * page's own words rather than about an element.
         */
        if (!page.drawn && clip.bg && clip.poster) {
          if (clip.glare === undefined) {
            say('says', 'clip-glare', `${named} is laid out by its words and they sit straight on ${name}, whose brightness was never measured. A clip moves, so one still cannot answer for it: a background of its own behind the words is the safe way.`, el.id);
          } else if (clip.glare > GLARE) {
            say('says', 'clip-glare', `${named}'s own words sit straight on ${name}, and the clip goes as pale as ${clip.glare} of 255 somewhere in it. They will be lost there.`, el.id);
          }
        }
        const box = page.drawn ? boxOf(el, ratio) : undefined;
        const over = box ? elements.filter((e) => e.kind === 'text'
          && ((e as TextEl).backing ?? 'none') === 'none'
          && (e.z ?? 0) >= (el.z ?? 0)
          && e.x !== undefined && e.y !== undefined
          && e.x >= box.left && e.x <= box.right && e.y >= box.top && e.y <= box.bottom) : [];
        if (over.length && clip.poster) {
          if (clip.glare === undefined) {
            say('says', 'clip-glare', `${nameOf(over[0], elements.indexOf(over[0]) + 1)} sits on ${name} with no backing, and how bright that clip gets was never measured. Give the words a scrim or a shadow: a clip moves, so one still cannot answer for it.`, over[0].id);
          } else if (clip.glare > GLARE) {
            say('says', 'clip-glare', `${nameOf(over[0], elements.indexOf(over[0]) + 1)} sits on ${name} with no backing, and the clip goes as pale as ${clip.glare} of 255 somewhere in it. Pale words will be lost there — a scrim or a shadow holds them through the whole clip.`, over[0].id);
          }
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

  /*
   * Every clip in the design, added up.
   *
   * One clip inside the per-clip ceiling is fine; six of them is tens of
   * megabytes before a guest has read a word, and no per-clip rule can see
   * that. A guest of one invitation scrolls the whole of it, so the sum is
   * across every page rather than per page — which is also why this blocks
   * rather than says. The same address twice is one download, so it counts
   * once.
   */
  if (weights) {
    const urls = new Set(doc.pages.flatMap((pg) => (pg.elements ?? []).filter((e) => e.kind === 'video').map((e) => (e as VideoEl).url)).filter(Boolean));
    const known = [...urls].filter((u) => weights[u] !== undefined);
    const total = known.reduce((sum, u) => sum + weights[u], 0);
    if (total > VIDEO_BUDGET_BYTES) {
      out.push({
        level: 'blocks',
        rule: 'clip-budget',
        page: '',
        text: `This design's ${known.length} clips weigh ${Math.round(total / 1024 / 1024 * 10) / 10} MB together, and ${VIDEO_BUDGET_LABEL} is the most one invitation may ask a guest to download. Shorten one, or take one off a page.`,
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
