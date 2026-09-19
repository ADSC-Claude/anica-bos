import type { Occasion, Tier } from '@prisma/client';
import { SECTION_BY_KEY, sectionOrder, sectionUnlocked, fieldsFor, type Field, type SectionKey } from './sections';
import { TIER_LABELS } from './tiers';
import { occasionLabel } from './occasions';

/**
 * The details sheet: everything an invitation asks its owner for, as a
 * document they can download, print, fill in at the kitchen table and send
 * back — or simply read, to know what to gather before they sit down at the
 * form.
 *
 * It is built from the same parts and boxes as the Invitation tab, for the
 * same occasion and the same package, so it can never ask for something the
 * form does not, or leave out something the form will. A Basic wedding's
 * sheet has no entourage page because a Basic wedding has none; a Luxury
 * one asks about the guestbook and the album because Luxury includes them.
 * The fixed writings (`staff`) are ours and are not on it, and a box a
 * design has not asked for (`byDesign`) is not either.
 *
 * Pure: the model here, a Word file and a printed page drawn from it
 * elsewhere.
 */
export type SheetItem =
  | { kind: 'line'; label: string; hint?: string }
  | { kind: 'lines'; label: string; hint?: string }
  | { kind: 'choice'; label: string; options: string[]; many: boolean; hint?: string }
  | { kind: 'yesno'; label: string; hint?: string }
  | { kind: 'table'; label: string; columns: string[]; rows: number; hint?: string; photos?: string }
  | { kind: 'file'; label: string; what: 'photo' | 'song' | 'file'; name: string; hint?: string }
  | { kind: 'colors'; label: string; hint?: string };

export type SheetPart = {
  n: number;
  key: SectionKey;
  label: string;
  description: string;
  /** an extra the owner may leave alone for ever */
  optional: boolean;
  items: SheetItem[];
};

export type Sheet = {
  occasion: Occasion;
  occasionLabel: string;
  tier: Tier;
  packageLabel: string;
  parts: SheetPart[];
  /** every file the sheet asks to be sent, with the name to give it */
  files: { name: string; what: string }[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A field the owner answers: not ours, and not one a design has not asked for. */
// A choice about the part (the switch that keeps a page off) is not something
// to write down and send us, so the sheet leaves it out.
const theirs = (f: Field) => !f.staff && !f.byDesign && !f.aside;

/** The options a person may choose from, without the ones their package cannot have. */
const offered = (f: Field, tier: Tier) => (f.options ?? []).filter((o) => !o.lockedTier || tierAtLeast(tier, o.lockedTier)).map((o) => o.label);

const RANK: Record<Tier, number> = { BASIC: 0, STANDARD: 1, COMPLETE: 2, LUXURY: 3 };
const tierAtLeast = (tier: Tier, min: Tier) => RANK[tier] >= RANK[min];

function hintOf(f: Field): string | undefined {
  const bits = [f.hint];
  if (!f.hint && f.placeholder) bits.push(/^e\.g\./i.test(f.placeholder) ? f.placeholder : `e.g. ${f.placeholder}`);
  if (f.type === 'date') bits.push('e.g. 24 November 2026');
  if (f.type === 'time') bits.push('e.g. 3:00 PM');
  if (f.type === 'offset') bits.push('minutes and seconds into the song, e.g. 1:05');
  if ((f.type === 'text' || f.type === 'textarea') && f.max) bits.push(`up to ${f.max} characters`);
  const s = bits.filter(Boolean).join(' · ');
  return s || undefined;
}

function items(part: string, fields: Field[], tier: Tier, files: Sheet['files']): SheetItem[] {
  const out: SheetItem[] = [];
  for (const f of fields.filter(theirs)) {
    const label = f.label + (f.required ? ' *' : '');
    const hint = hintOf(f);
    switch (f.type) {
      case 'text':
      case 'url':
      case 'number':
      case 'date':
      case 'time':
      case 'offset':
        out.push({ kind: 'line', label, hint });
        break;
      case 'textarea':
        out.push({ kind: 'lines', label, hint });
        break;
      case 'select':
      case 'styles':
        out.push({ kind: 'choice', label, options: offered(f, tier), many: false, hint });
        break;
      case 'checks':
        out.push({ kind: 'choice', label, options: offered(f, tier), many: true, hint });
        break;
      case 'toggle':
        out.push({ kind: 'yesno', label, hint });
        break;
      case 'person':
        out.push({ kind: 'line', label, hint: [hint, 'title and full name; add † after a name of someone who has passed'].filter(Boolean).join(' · ') });
        break;
      case 'colors':
      case 'swatches':
        out.push({ kind: 'colors', label, hint });
        break;
      case 'image': {
        const name = `${slug(part)}-${slug(f.label)}.jpg`;
        files.push({ name, what: `${part}: ${f.label}` });
        out.push({ kind: 'file', label, what: 'photo', name, hint });
        break;
      }
      case 'audio': {
        const name = `${slug(part)}-${slug(f.label)}.mp3`;
        files.push({ name, what: `${part}: ${f.label}` });
        out.push({ kind: 'file', label, what: 'song', name, hint });
        break;
      }
      case 'list': {
        const sub = (f.item ?? []).filter(theirs);
        const pictures = sub.filter((s) => s.type === 'image');
        const columns = sub.filter((s) => s.type !== 'image').map((s) => s.label);
        const max = f.max ?? 12;
        let photos: string | undefined;
        if (pictures.length) {
          const name = `${slug(part)}-${slug(f.label)}-1.jpg, -2.jpg …`;
          files.push({ name, what: `${part}: ${f.label} (up to ${max})` });
          photos = `${pictures.length === 1 ? 'One photo' : `${pictures.length} photos`} for each row, named ${name}`;
        }
        if (columns.length === 0) {
          // pictures alone — the extra photographs, a gallery with no captions
          out.push({ kind: 'file', label, what: 'photo', name: `${slug(part)}-${slug(f.label)}-1.jpg, -2.jpg …`, hint: [hint, `up to ${max}`].filter(Boolean).join(' · ') });
          break;
        }
        out.push({ kind: 'table', label, columns, rows: Math.min(max, 8), hint: [hint, max < 200 ? `up to ${max}` : undefined].filter(Boolean).join(' · ') || undefined, photos });
        break;
      }
    }
  }
  return out;
}

export function detailsSheet(inv: { occasion: Occasion; tier: Tier; addOns?: string[]; layout?: string }): Sheet {
  const files: Sheet['files'] = [];
  const parts: SheetPart[] = [];
  let n = 0;
  for (const key of sectionOrder(inv.occasion, inv.layout ?? '')) {
    const def = SECTION_BY_KEY[key];
    if (def.hidden) continue;
    if (!sectionUnlocked(key, inv.occasion, inv.tier, inv.addOns ?? [])) continue;
    const label = def.labelFor?.[inv.occasion] ?? def.label;
    const list = items(label, fieldsFor(key, inv.occasion, inv.tier), inv.tier, files);
    if (list.length === 0) continue;
    parts.push({ n: ++n, key, label, description: def.description, optional: Boolean(def.optional), items: list });
  }
  return { occasion: inv.occasion, occasionLabel: occasionLabel(inv.occasion), tier: inv.tier, packageLabel: TIER_LABELS[inv.tier], parts, files };
}

/** A filename a person can find again: juan-and-maria-details.docx */
export function sheetFilename(slugOrTitle: string): string {
  return `${slug(slugOrTitle) || 'invitation'}-details.docx`;
}
