import type { Occasion } from '@prisma/client';
import { fieldOf, shapeOf } from './asks';
import type { DesignDoc, FieldRef, PhotoEl, TextEl } from './design';

/**
 * What the canvas is drawn against.
 *
 * A design is drawn against one demo invitation, and the demo is always the
 * kind customer: a name that fits, a sentence the right length, a photograph
 * in the right shape. Every real customer is somebody else. A heading drawn
 * to "Lucas Andrei" meets "Ma. Sofia Concepcion Villanueva-Bartolome" and
 * runs off the page, and nobody finds out until it is somebody's invitation.
 *
 * So the studio can put four different people in front of the design:
 *
 * - **the demo**, which is what she is designing to;
 * - **nobody**, every box empty, which is what a half-filled invitation
 *   looks like and is the only way to see whether a page still holds up;
 * - **anybody**, every box filled with what the question is called, so a
 *   page she has never seen filled can be read at a glance;
 * - **the longest**, every box filled to the exact number of letters the
 *   form will let a customer type — the worst case, and the one that breaks
 *   a design.
 *
 * All of it is made here, from the document and the field list, and none of
 * it is ever saved: it is what the canvas draws, not what anybody has.
 *
 * What it fills is what the *document* names: every field an element on a
 * page is bound to. A page laid out by its words renders its whole section
 * and is not drawn by hand at all, so there is nothing on it for this to
 * stand in for.
 */

export type Sample = 'demo' | 'empty' | 'anybody' | 'longest';

export const SAMPLES: { key: Sample; label: string }[] = [
  { key: 'demo', label: 'The demo' },
  { key: 'empty', label: 'Nobody — every box empty' },
  { key: 'anybody', label: 'Anybody — every box filled' },
  { key: 'longest', label: 'The longest a customer can type' },
];

/**
 * Names and words with the shapes Filipino names actually have: long ones,
 * hyphenated ones, ones with no short form. Used to fill a box to its exact
 * cap, so the last one is cut wherever the cap falls — which is what a
 * customer who fills the box gets too.
 */
const WORDS = [
  'Maria', 'Concepcion', 'Villanueva-Bartolome', 'Salvacion', 'Ninong', 'Bernardo',
  'Magandang', 'kapatid', 'pamilya', 'Dela', 'Cruz', 'Buenaventura',
];

/** Exactly `n` letters of plausible words, the last one cut where the cap falls. */
export function longestWords(n: number): string {
  if (n <= 0) return '';
  let out = '';
  for (let i = 0; out.length < n; i++) out += (out ? ' ' : '') + WORDS[i % WORDS.length];
  return out.slice(0, n);
}

/** A stand-in photograph in roughly the shape the frame wants. */
function standIn(aspect: number | undefined): string {
  const shape = shapeOf(aspect);
  if (shape === 'landscape' || shape === 'wide') return '/demo/placeholder-photo-wide.png';
  if (shape === 'square') return '/demo/placeholder-photo-square.png';
  return '/demo/placeholder-photo.png';
}

/** Every field the document's own elements are bound to, with the element that binds it. */
function bindings(doc: DesignDoc): { ref: FieldRef; el: PhotoEl | TextEl }[] {
  const out: { ref: FieldRef; el: PhotoEl | TextEl }[] = [];
  for (const page of doc.pages) {
    for (const el of page.elements ?? []) {
      if (el.kind === 'photo') {
        if (!('asset' in el.bind)) out.push({ ref: el.bind, el });
      } else if (el.kind === 'text') {
        for (const line of el.lines) for (const s of line.sources) if ('bind' in s) out.push({ ref: s.bind, el });
      }
    }
  }
  return out;
}

/**
 * Write one answer where a binding reads it.
 *
 * A list read with `skipEmpty` counts only the rows whose named field is
 * filled, so every row this makes gets that field too — otherwise writing
 * row three would land on row one and the frames would all show the same
 * picture.
 */
function putAt(into: Record<string, unknown>, ref: FieldRef, value: string) {
  const section = (into[ref.section] as Record<string, unknown> | undefined) ?? {};
  into[ref.section] = section;
  if (ref.index === undefined) {
    section[ref.field] = value;
    return;
  }
  const list = (Array.isArray(section[ref.field]) ? section[ref.field] : []) as Record<string, unknown>[];
  section[ref.field] = list;
  while (list.length <= ref.index) list.push({});
  const row = list[ref.index];
  row[ref.sub ?? 'value'] = value;
  if (ref.skipEmpty && !row[ref.skipEmpty]) row[ref.skipEmpty] = value;
}

/**
 * The content the canvas draws against. `demo` is handed back untouched;
 * everything else is made here and belongs to nobody.
 */
export function sampleContent(
  kind: Sample,
  { doc, occasion, demo }: { doc: DesignDoc | null; occasion: Occasion; demo: Record<string, unknown> },
): Record<string, unknown> {
  if (kind === 'demo') return demo;
  if (kind === 'empty' || !doc) return {};
  const out: Record<string, unknown> = {};
  for (const { ref, el } of bindings(doc)) {
    if (el.kind === 'photo') {
      putAt(out, ref, standIn(el.aspect));
      continue;
    }
    const field = fieldOf(ref, occasion);
    if (kind === 'anybody') {
      // the question's own name, so a box she has never seen filled reads at
      // a glance as the thing it is for
      putAt(out, ref, field?.label ?? ref.sub ?? ref.field);
      continue;
    }
    // the exact cap a customer will meet: the form's own, narrowed to the
    // room the box holds where the design measured it
    const cap = Math.min(field?.max ?? 60, el.room ?? Number.POSITIVE_INFINITY);
    putAt(out, ref, longestWords(cap));
  }
  return out;
}
