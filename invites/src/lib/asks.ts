import type { Occasion } from '@prisma/client';
import { fieldsFor, sectionLabel, OCCASION_SECTIONS, type Field, type SectionKey } from './sections';
import { frameLists, type DesignDoc, type Element, type FieldRef, type PhotoEl, type TextEl, type MomentEl } from './design';
import { MOMENT_BY_KEY, momentName } from './moments';

/**
 * What a design asks its customer for.
 *
 * A frame she draws and marks **Ask the customer** is a question on that
 * design's form, and the box she drew is the answer's size: a heading box
 * that holds about twenty letters asks for twenty. This turns the document
 * into that list — the one the left column keeps while she works, the one
 * the form is built from, and the one the asks sheet prints.
 *
 * It reads the document only. Nothing here queries anything, so the studio
 * can keep the list live as she draws and the form can read the same list
 * from the published design.
 */

export type AskShape = 'portrait' | 'square' | 'landscape' | 'tall' | 'wide';

export type Ask = {
  /** the element that asks it, so a line in the list can jump to it */
  id: string;
  page: string;
  kind: 'photo' | 'text';
  ref: FieldRef;
  /** "Our Story — a photograph (3 of 6)" */
  label: string;
  /** what the field is called on the form, when the design points at a real one */
  field?: string;
  /** a photograph's frame, in words a customer can act on */
  shape?: AskShape;
  /** the frame's own height over its width, so a customer can be shown the real cut while they move the picture inside it */
  aspect?: number;
  /** the shape it is cut to, where it is cut to one */
  cut?: 'circle' | 'arch';
  /**
   * She ticked "Ask the customer" on this element herself.
   *
   * A frame is surveyed whether or not she did, because a frame pointed at
   * a customer's field is a place for their photograph by construction. The
   * tick is still a different statement — *I am counting on this slot* —
   * and the checklist's questions about a slot are hers to answer, so they
   * are asked only where she made it.
   */
  marked?: true;
  guidance?: string;
  /** the letters the box holds: the form's cap for this answer */
  room?: number;
  /** what an unanswered frame shows */
  ifEmpty?: 'leave' | { piece: string };
  /** the design points at a field this occasion does not have */
  orphan?: boolean;
  /** which of a moment's photographs this is, where it has more than one */
  slot?: number;
};

/** A frame's proportions, in a word. */
export function shapeOf(aspect: number | undefined): AskShape {
  const a = aspect ?? 1;
  if (a >= 1.9) return 'tall';
  if (a >= 1.15) return 'portrait';
  if (a <= 0.52) return 'wide';
  if (a <= 0.87) return 'landscape';
  return 'square';
}

/** What to tell a customer about a photograph that has to fit this frame. */
export const SHAPE_GUIDANCE: Record<AskShape, string> = {
  portrait: 'Upright, taller than it is wide. Keep the face in the middle: the sides are trimmed.',
  square: 'Square. Keep what matters in the middle: the edges are trimmed.',
  landscape: 'Wider than it is tall. Keep what matters in the middle: the top and bottom are trimmed.',
  tall: 'Very tall and narrow. A standing photograph, with room above and below the face.',
  wide: 'Very wide and short, like a banner. Nothing important near the top or the bottom.',
};

/**
 * And what the frame's cut does to it, which a customer has to know before
 * they choose: a face that sits near a corner of the picture is not in the
 * circle at all. A frame with square corners says nothing extra.
 */
export const CUT_GUIDANCE: Record<'circle' | 'arch', string> = {
  circle: 'It is cut to a circle, so keep the face well inside the middle and away from the corners.',
  arch: 'It is cut to an arch, rounded right across the top, so nothing that matters goes in the top corners.',
};

/**
 * Every question one element puts, with the room the box leaves for each.
 *
 * A box is not one question. The christening's programme row holds the
 * title and the sentence under it in one box, because the sentence has to
 * follow the title down when the title runs to two lines; the assistance
 * page holds a name over a phone number. Reading only the first binding
 * lost the second question altogether — off the checklist, off the encoder's
 * sheet, and out of `roomFor`, so the form asked for more letters than the
 * box holds and nobody was told.
 *
 * The room is the line's own where it has one, because two lines of one box
 * are two different sizes and hold two different numbers of letters.
 */
const refsOf = (el: Element): Array<{ ref: FieldRef; room?: number }> => {
  if (el.kind === 'photo') return 'asset' in el.bind ? [] : [{ ref: el.bind }];
  if (el.kind !== 'text') return [];
  const out: Array<{ ref: FieldRef; room?: number }> = [];
  for (const line of el.lines) {
    for (const s of line.sources) {
      if (!('bind' in s)) continue;
      const room = line.room ?? el.room;
      out.push({ ref: s.bind, ...(room ? { room } : {}) });
      break;
    }
  }
  return out;
};

/**
 * What a moment asks for: each of its photographs that reads a field, then
 * the first field its words read. One moment can be several questions —
 * the polaroid stack is three photographs — so each is its own line, named
 * by the scene ("a photograph in the stack") rather than by a frame number.
 */
function momentAsks(el: MomentEl): Array<{ ref: FieldRef; kind: 'photo' | 'text'; slot?: number; what: string; shape?: AskShape }> {
  const def = MOMENT_BY_KEY[el.moment];
  const out: Array<{ ref: FieldRef; kind: 'photo' | 'text'; slot?: number; what: string; shape?: AskShape }> = [];
  (el.photos ?? []).forEach((p, i) => {
    if ('asset' in p.bind) return;
    out.push({ ref: p.bind, kind: 'photo', slot: i, what: def?.photos.label || 'a photograph', shape: def?.photos.shape });
  });
  for (const line of el.lines ?? []) for (const s of line.sources) if ('bind' in s) { out.push({ ref: s.bind, kind: 'text', what: 'its words' }); return out; }
  return out;
}

/** The field a binding points at, if the occasion has it. */
export function fieldOf(ref: FieldRef, occasion: Occasion): Field | undefined {
  if (!OCCASION_SECTIONS[occasion].includes(ref.section as SectionKey)) return undefined;
  const fields = fieldsFor(ref.section as SectionKey, occasion);
  const top = fields.find((f) => f.key === ref.field);
  if (!top) return undefined;
  return ref.sub ? top.item?.find((f) => f.key === ref.sub) ?? undefined : top;
}

/** Everything this design asks for, in the order the pages run. */
export function asksOf(doc: DesignDoc | null, occasion: Occasion): Ask[] {
  const lists = new Map(frameLists(doc).map((f) => [`${f.section}.${f.field}`, f.count]));
  const out: Ask[] = [];
  for (const page of doc?.pages ?? []) {
    for (const el of page.elements ?? []) {
      /*
       * A frame is a question whether or not anybody ticked the box.
       *
       * `ask` is a checkbox in the studio, and it was never ticked on the
       * designs written in code from the designer's file — so the survey
       * saw no photographs at all on the christening, and the form could
       * not be told what shape its frames are or let a customer move a
       * picture inside one. A frame pointed at a customer's own field is a
       * place for their photograph by construction; there is nothing for
       * the box to add. It still gates everything else, which is what it
       * is for: a line of writing may be the design's own words rather
       * than a question, and a moment may have no picture picked yet.
       */
      if (!el.ask && !(el.kind === 'photo' && !('asset' in el.bind))) continue;
      if (el.kind === 'moment') {
        for (const a of momentAsks(el)) {
          const field = fieldOf(a.ref, occasion);
          const of = lists.get(`${a.ref.section}.${a.ref.field}`);
          const place = a.ref.index === undefined ? '' : of && of > 1 ? ` (${a.ref.index + 1} of ${of})` : ` ${a.ref.index + 1}`;
          out.push({
            id: el.id, page: page.key, kind: a.kind, ref: a.ref, field: field?.key,
            label: `${sectionLabel(a.ref.section as SectionKey, occasion)} — ${momentName(el.moment, el.variant)}: ${a.what}${place}`,
            ...(a.slot !== undefined ? { slot: a.slot } : {}),
            ...(a.shape ? { shape: a.shape, guidance: SHAPE_GUIDANCE[a.shape] } : {}),
            ...(el.ifEmpty ? { ifEmpty: el.ifEmpty } : {}),
            ...(field ? {} : { orphan: true }),
          });
        }
        continue;
      }
      if (el.kind !== 'photo' && el.kind !== 'text') continue;
      for (const { ref, room } of refsOf(el)) {
        const field = fieldOf(ref, occasion);
        const of = lists.get(`${ref.section}.${ref.field}`);
        const place = ref.index === undefined ? '' : of && of > 1 ? ` (${ref.index + 1} of ${of})` : ` ${ref.index + 1}`;
        const what = field?.label ?? ref.sub ?? ref.field;
        const shape = el.kind === 'photo' ? shapeOf((el as PhotoEl).aspect) : undefined;
        const cut = el.kind === 'photo' ? (el as PhotoEl).mask : undefined;
        const guidance = shape
          ? cut && cut !== 'none' ? `${SHAPE_GUIDANCE[shape]} ${CUT_GUIDANCE[cut]}` : SHAPE_GUIDANCE[shape]
          : undefined;
        out.push({
          id: el.id,
          page: page.key,
          kind: el.kind,
          ref,
          field: field?.key,
          label: `${sectionLabel(ref.section as SectionKey, occasion)} — ${what}${place}`,
          ...(shape ? { shape, guidance } : {}),
          ...(el.kind === 'photo' ? { aspect: (el as PhotoEl).aspect ?? 1 } : {}),
          ...(cut && cut !== 'none' ? { cut } : {}),
          ...(el.ask ? { marked: true as const } : {}),
          ...(el.kind === 'text' && room ? { room } : {}),
          ...(el.ifEmpty ? { ifEmpty: el.ifEmpty } : {}),
          ...(field ? {} : { orphan: true }),
        });
      }
    }
  }
  return out;
}

/**
 * The cap the form should put on one field, where the design has measured a
 * box for it. Two boxes asking for the same field agree on the smaller: the
 * design has to hold whatever the customer writes, in every place it shows.
 */
export function roomFor(asks: Ask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of asks) {
    if (!a.room) continue;
    const key = `${a.ref.section}.${a.ref.field}${a.ref.sub ? `.${a.ref.sub}` : ''}`;
    out[key] = out[key] ? Math.min(out[key], a.room) : a.room;
  }
  return out;
}

/**
 * How many photographs and how many writings a design asks for, for the line
 * that says so before she publishes.
 */
export function askCounts(asks: Ask[]): { photos: number; writings: number; orphans: number } {
  return {
    photos: asks.filter((a) => a.kind === 'photo').length,
    writings: asks.filter((a) => a.kind === 'text').length,
    orphans: asks.filter((a) => a.orphan).length,
  };
}

/** The fields a design could ask for on one occasion: what the picker offers. */
export type Askable = { section: SectionKey; sectionLabel: string; field: string; sub?: string; label: string; type: string; list: boolean; max?: number };

export function askable(occasion: Occasion, kind: 'photo' | 'text'): Askable[] {
  /*
   * A date and a time are askable as words now, because a box bound to one
   * can say it properly: a date is stored as `2026-12-18` and a time as
   * `16:00`, and `FieldRef.show` turns those into the words a design had in
   * their place — "18 December 2026", "4:00 PM". Before that they were left
   * out, since a cover reading `2026-12-18` is worse than a cover with no
   * date on it at all, and the app's own hero drew the date instead.
   *
   * It matters for a page brought in from a master designed elsewhere:
   * every such cover carries the date and the time as words, and a box put
   * where those words were has to be able to be wired to them.
   */
  const wanted = kind === 'photo' ? ['image'] : ['text', 'textarea', 'date', 'time'];
  const out: Askable[] = [];
  for (const key of OCCASION_SECTIONS[occasion]) {
    const label = sectionLabel(key, occasion);
    // A customer is asked for their own answers, never for the encoder's —
    // except the media fields every part carries, which are staff's precisely
    // until a design binds one, so the picker has to offer them.
    for (const f of fieldsFor(key, occasion).filter((f) => !f.staff || f.byDesign)) {
      if (wanted.includes(f.type)) out.push({ section: key, sectionLabel: label, field: f.key, label: f.label, type: f.type, list: false, max: f.max });
      for (const sub of f.item ?? []) {
        if (wanted.includes(sub.type)) out.push({ section: key, sectionLabel: label, field: f.key, sub: sub.key, label: `${f.label} — ${sub.label}`, type: sub.type, list: true, max: sub.max ?? f.max });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The form this design asks for
// ---------------------------------------------------------------------------

/**
 * What a published design changes about its customers' form.
 *
 * Three things, and only three, because only three are the design's to say.
 * How many rows a list offers, because the design draws a fixed number of
 * frames and a seventh photograph has nowhere to go. How many letters a box
 * holds, because she measured it. What shape a photograph has to be, because
 * she drew the frame. Everything else — which sections exist, which the
 * package unlocks, what each field is called — is the occasion's and the
 * package's, and a design has no business moving it.
 *
 * Keyed `section.field`, and `section.field.sub` for a field inside a list.
 */
export type DesignForm = {
  /** a list's cap, from the frames drawn for it */
  rows: Record<string, number>;
  /** the letters a box holds, from the box she drew */
  room: Record<string, number>;
  /** what a photograph has to fit, in words a customer can act on */
  shape: Record<string, string>;
  /**
   * The frame itself — its proportions and its cut — so the form can show a
   * customer the real window their photograph is going into and let them
   * move it inside that window rather than describe it in words.
   *
   * Only where every frame on the field agrees, for the same reason `shape`
   * is: a field drawn once square and once tall has no one window to offer.
   */
  frame: Record<string, { aspect: number; cut?: 'circle' | 'arch' }>;
  /** the design's own line for a box, offered to the customer as a starting point */
  example: Record<string, { en: string; tl: string }>;
  /**
   * Every field any element on the design points at.
   *
   * Unlike the four above this is not about narrowing a form: it is what
   * opens the media field every part carries. A picture the design draws a
   * place for is a picture to ask for; one it does not is a box nobody
   * should be shown.
   */
  binds: Record<string, true>;
};

const EMPTY: DesignForm = { rows: {}, room: {}, shape: {}, frame: {}, example: {}, binds: {} };

/** How far apart two frames' proportions may be and still be the same frame. */
const FRAME_SAME = 0.02;

/** An example's chip: her line, short enough to read at a glance. */
const chip = (line: string): string => (line.length > 54 ? `${line.slice(0, 53).trimEnd()}\u2026` : line);

export function designForm(doc: DesignDoc | null, occasion: Occasion): DesignForm {
  if (!doc) return EMPTY;
  const asks = asksOf(doc, occasion);
  const rows: Record<string, number> = {};
  for (const list of frameLists(doc)) rows[`${list.section}.${list.field}`] = list.count;
  const shape: Record<string, string> = {};
  for (const a of asks) {
    if (a.kind !== 'photo' || !a.shape) continue;
    const key = `${a.ref.section}.${a.ref.field}${a.ref.sub ? `.${a.ref.sub}` : ''}`;
    /*
     * Two frames on one field speak only if they agree; otherwise say
     * nothing rather than tell a customer to crop for a shape half her
     * photographs are not.
     *
     * And a disagreement is final. It used to be written as an empty
     * string that the next frame overwrote, so with three frames — two
     * portrait and one landscape between them — the third put the
     * portrait guidance back and the customer was told to crop for a
     * shape one of the three frames is not. Two frames could never show
     * it, which is all any design had while the survey only saw marked
     * elements.
     */
    if (key in shape && shape[key] !== SHAPE_GUIDANCE[a.shape]) shape[key] = '';
    else if (!(key in shape)) shape[key] = SHAPE_GUIDANCE[a.shape];
  }
  for (const key of Object.keys(shape)) if (!shape[key]) delete shape[key];
  /*
   * And the frame itself, where the frames on one field agree.
   *
   * "Agree" to within a fiftieth, not exactly. The christening's three
   * polaroids are 0.9563, 0.9590 and 0.9563 — measured off her artwork, so
   * no two are the same number and all three are the same frame. Demanding
   * exactness offered a window on none of them, which is the page whose
   * photographs she said were too zoomed in. Where they do differ the
   * tallest wins: it is the one that trims the most, so a picture fitted to
   * it is inside all of them.
   *
   * Really different shapes still offer nothing, because there is no one
   * window to move a picture inside.
   */
  const frame: Record<string, { aspect: number; cut?: 'circle' | 'arch' } | null> = {};
  for (const a of asks) {
    if (a.kind !== 'photo' || a.aspect === undefined) continue;
    const key = `${a.ref.section}.${a.ref.field}${a.ref.sub ? `.${a.ref.sub}` : ''}`;
    const one = { aspect: a.aspect, ...(a.cut ? { cut: a.cut } : {}) };
    const was = frame[key];
    if (was === undefined) { frame[key] = one; continue; }
    if (was === null || was.cut !== one.cut || Math.abs(was.aspect - one.aspect) > FRAME_SAME * Math.max(was.aspect, one.aspect)) frame[key] = null;
    else if (one.aspect > was.aspect) frame[key] = one;
  }
  const frames: DesignForm['frame'] = {};
  for (const [key, one] of Object.entries(frame)) if (one) frames[key] = one;
  return { rows, room: roomFor(asks), shape, frame: frames, example: offered(doc), binds: bound(doc) };
}

/**
 * Every field the design points at, asked for or not.
 *
 * A frame can carry a customer's photograph without the form asking for it —
 * "use it if it is there" — and that still counts: the field has a place on
 * the page, which is the only question this answers.
 */
function bound(doc: DesignDoc): Record<string, true> {
  const out: Record<string, true> = {};
  for (const page of doc.pages) {
    for (const el of page.elements ?? []) {
      const refs: FieldRef[] = [];
      if (el.kind === 'photo') {
        if (!('asset' in el.bind)) refs.push(el.bind);
        if (el.alt) refs.push(el.alt);
      }
      if (el.kind === 'text') refs.push(...el.lines.flatMap((l) => l.sources).flatMap((x) => ('bind' in x ? [x.bind] : [])));
      // a moment's photographs and its words are places for a customer's own, the same as a frame's and a box's
      if (el.kind === 'moment') {
        for (const p of el.photos ?? []) if (!('asset' in p.bind)) refs.push(p.bind);
        refs.push(...(el.lines ?? []).flatMap((l) => l.sources).flatMap((x) => ('bind' in x ? [x.bind] : [])));
      }
      for (const r of refs) out[`${r.section}.${r.field}${r.sub ? `.${r.sub}` : ''}`] = true;
    }
  }
  return out;
}

/** Whether this design has drawn a place for one field. */
export const designBinds = (form: DesignForm, section: string, field: string, sub?: string): boolean =>
  Boolean(form.binds[`${section}.${field}${sub ? `.${sub}` : ''}`]);

/**
 * The media fields this design asked for, and none of the others.
 *
 * Every part of an invitation carries a place for a picture of theirs, and
 * every one of them is nobody's business until a published design draws a
 * frame for it: unbound, the field is dropped outright rather than left
 * sitting in an encoder's workspace twenty times over; bound, it stops
 * being staff's and becomes the customer's own question.
 *
 * The fixed writings are staff's for a different reason — they are our
 * words, not a box waiting for anybody — and are untouched here.
 *
 * A design that binds none of them hands back the very array it was given,
 * which is how today's forms stay exactly as they are.
 */
export function designMedia(fields: Field[], section: string, form: DesignForm): Field[] {
  if (!fields.some((f) => f.byDesign)) return fields;
  return fields.flatMap((f) => {
    if (!f.byDesign) return [f];
    if (!designBinds(form, section, f.key)) return [];
    const { staff: _staff, ...rest } = f;
    return [rest as Field];
  });
}

/**
 * The lines a design offers as examples.
 *
 * A box on the form can be the hardest thing to fill in, and the person who
 * knows best what belongs in it is the one who drew the page: she wrote a
 * line there herself, for the demo, and marked it **offer it as an example**.
 * It arrives under the customer's box as one more thing to tap.
 *
 * Only a line she typed in the design itself is offered. A line that reads
 * from the look would change with the look the customer picks, so offering it
 * as fixed words would be offering them something they might never see, and a
 * line from the app's own copy is not the designer's to offer.
 *
 * Two boxes offering for the same field is a design that shows one answer in
 * two places: the first one drawn wins, because two chips saying nearly the
 * same thing help nobody.
 */
function offered(doc: DesignDoc): Record<string, { en: string; tl: string }> {
  const out: Record<string, { en: string; tl: string }> = {};
  for (const page of doc.pages) {
    for (const el of page.elements ?? []) {
      if (el.kind !== 'text' || !el.offerLine) continue;
      const sources = el.lines.flatMap((l) => l.sources);
      const ref = sources.flatMap((x) => ('bind' in x ? [x.bind] : []))[0];
      const own = sources.flatMap((x) => ('fixed' in x ? [x.fixed] : []))[0];
      if (!ref || !own?.en.trim()) continue;
      const key = `${ref.section}.${ref.field}${ref.sub ? `.${ref.sub}` : ''}`;
      if (!out[key]) out[key] = { en: own.en, tl: own.tl?.trim() || own.en };
    }
  }
  return out;
}

/** Whether a design has anything to say about the form at all. */
export const asksNothing = (form: DesignForm): boolean =>
  !Object.keys(form.rows).length && !Object.keys(form.room).length
  && !Object.keys(form.shape).length && !Object.keys(form.example).length;

/**
 * One section's fields as this design asks for them.
 *
 * A design that says nothing about a field gives back the very field it was
 * given, and a section it says nothing about gives back the very array: the
 * contract is that a design asking for nothing leaves today's form exactly as
 * it is, and identity is the plainest way to keep it and to test it.
 *
 * Where a design does speak it only ever narrows. A box measured at twenty
 * letters caps a field the occasion allowed forty; it never raises a cap,
 * because the occasion's number is about what the words are for and the
 * design's is about what fits.
 */
export function askedFields(fields: Field[], section: string, form: DesignForm): Field[] {
  if (asksNothing(form)) return fields;
  let moved = false;
  const out = fields.map((f) => {
    const key = `${section}.${f.key}`;
    let next = f;
    const cap = Math.min(form.rows[key] ?? Infinity, form.room[key] ?? Infinity, f.max ?? Infinity);
    if (Number.isFinite(cap) && cap !== f.max) next = { ...next, max: cap };
    const guide = form.shape[key];
    if (guide) next = { ...next, hint: [f.hint, guide].filter(Boolean).join(' ') };
    // the design's own line, under the customer's box and after any the app
    // already offers: hers is the one written for this page, not for the
    // occasion in general, so it reads last and closest to the box
    const own = form.example[key];
    if (own) next = { ...next, examples: [...(f.examples ?? []), { key: 'design', label: chip(own.en), en: own.en, tl: own.tl }] };
    if (f.item) {
      const item = askedFields(f.item, `${section}.${f.key}`, form);
      if (item !== f.item) next = { ...next, item };
    }
    if (next !== f) moved = true;
    return next;
  });
  return moved ? out : fields;
}

/**
 * A list's cap for this section, for the forms that pass limits separately
 * from the fields. Only the lists the design actually draws frames for.
 */
export function askedLimits(section: string, form: DesignForm): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(form.rows)) {
    const [s, field] = key.split('.');
    if (s === section) out[field] = n;
  }
  return out;
}

/**
 * The frames this part's pictures go into, keyed the way the form keys a
 * field: `photo` for a picture of the section's own, `timeline.photo` for
 * one inside a list row.
 *
 * What it is for: a customer choosing a photograph cannot see the cut it is
 * going into, and "keep the face in the middle" only goes so far — the
 * frames on this design are square and most photographs on a phone are not.
 * Handed the real proportions, the form can show the window and let them
 * drag the picture about inside it.
 */
export function framesFor(section: string, form: DesignForm): Record<string, { aspect: number; cut?: 'circle' | 'arch' }> {
  const out: Record<string, { aspect: number; cut?: 'circle' | 'arch' }> = {};
  for (const [key, frame] of Object.entries(form.frame)) {
    const [s, ...rest] = key.split('.');
    if (s === section && rest.length) out[rest.join('.')] = frame;
  }
  return out;
}
