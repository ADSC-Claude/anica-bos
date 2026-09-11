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
      out.push({
        id: el.id,
        page: page.key,
        kind: el.kind,
        ref,
        field: field?.key,
        label: `${sectionLabel(ref.section as SectionKey, occasion)} — ${what}${place}`,
        ...(shape ? { shape, guidance: SHAPE_GUIDANCE[shape] } : {}),
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
