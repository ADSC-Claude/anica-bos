import type { Occasion } from '@prisma/client';
import { fieldsFor, sectionLabel, customerFields, OCCASION_SECTIONS, type Field, type SectionKey } from './sections';
import { frameLists, type DesignDoc, type Element, type FieldRef, type PhotoEl, type TextEl } from './design';

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
  guidance?: string;
  /** the letters the box holds: the form's cap for this answer */
  room?: number;
  /** what an unanswered frame shows */
  ifEmpty?: 'leave' | { piece: string };
  /** the design points at a field this occasion does not have */
  orphan?: boolean;
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

const refOf = (el: Element): FieldRef | undefined => {
  if (el.kind === 'photo') return 'asset' in el.bind ? undefined : el.bind;
  if (el.kind !== 'text') return undefined;
  for (const line of el.lines) for (const s of line.sources) if ('bind' in s) return s.bind;
  return undefined;
};

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
      if (!el.ask || (el.kind !== 'photo' && el.kind !== 'text')) continue;
      const ref = refOf(el);
      if (!ref) continue;
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
        ...(el.kind === 'text' && (el as TextEl).room ? { room: (el as TextEl).room } : {}),
        ...(el.ifEmpty ? { ifEmpty: el.ifEmpty } : {}),
        ...(field ? {} : { orphan: true }),
      });
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
  const wanted = kind === 'photo' ? ['image'] : ['text', 'textarea'];
  const out: Askable[] = [];
  for (const key of OCCASION_SECTIONS[occasion]) {
    const label = sectionLabel(key, occasion);
    // a customer is asked for their own answers, never for the encoder's
    for (const f of customerFields(fieldsFor(key, occasion))) {
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
  /** the design's own line for a box, offered to the customer as a starting point */
  example: Record<string, { en: string; tl: string }>;
};

const EMPTY: DesignForm = { rows: {}, room: {}, shape: {}, example: {} };

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
    // two frames on one field agree only if they agree; otherwise say nothing
    // rather than tell a customer to crop for a shape half her photos are not
    if (shape[key] && shape[key] !== SHAPE_GUIDANCE[a.shape]) shape[key] = '';
    else shape[key] = SHAPE_GUIDANCE[a.shape];
  }
  for (const key of Object.keys(shape)) if (!shape[key]) delete shape[key];
  return { rows, room: roomFor(asks), shape, example: offered(doc) };
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
