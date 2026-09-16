import type { Occasion, Tier } from '@prisma/client';
import { OCCASION_SECTIONS, SECTION_BY_KEY, sectionLabel, sectionMinTier, sectionOnCard, sectionOffered, sectionUnlocked, type SectionKey } from './sections';
import { TIER_LABELS } from './tiers';
import { documentOf, offeredSections } from './design';

/**
 * A whole part added to one invitation.
 *
 * A design decides which parts it draws, and that is right nearly always: a
 * christening design has a programme page because christenings have
 * programmes. But one couple asks for a part their design never had — a gift
 * note, a programme, a page for the ninongs — and changing the design to give
 * it to them changes it for everybody else on that design, which is not what
 * anybody asked for.
 *
 * So a part can be added to one invitation. The design is untouched; the
 * renderer already gives a part no page names a page of its own, on the
 * design's overflow ground, in its place in the order.
 *
 * Three rules, settled by the owner rather than inferred here:
 *
 * 1. **Staff add it, not the customer.** There is no customer path to this
 *    and no field on their form that reaches it; they ask, and we tick.
 * 2. **It never buys anything.** A part the package does not include stays
 *    refused, with the package that includes it named. The tier and the
 *    add-ons decide what an invitation may show; this decides only whether
 *    the design draws it, and the two gates are independent — which is why
 *    `sectionUnlocked` is asked here as well as on the form.
 * 3. **It works late.** Staff are not inside the three-week change window
 *    (`assertOpenForChanges` exempts them), so a part can be added and its
 *    words typed a week before the event. What the window closes is the
 *    customer's own editing, and this was never that.
 */

/** What the screen may do about one part of an invitation. */
export type PartState =
  /** the design draws it: nothing to add */
  | 'carried'
  /** this invitation carries it as an extra: it can be taken off again */
  | 'added'
  /** the design does not draw it and the package includes it: it can be added */
  | 'addable'
  /** the design does not draw it and the package does not include it either */
  | 'needs-upgrade';

export type Part = {
  key: SectionKey;
  label: string;
  state: PartState;
  /** the package that would include it, where that is what stands in the way */
  needs?: Tier;
};

/** The parts column as section keys, dropping anything the app no longer has. */
export function extraSectionsOf(raw: unknown): SectionKey[] {
  if (!Array.isArray(raw)) return [];
  const all = new Set<string>(Object.values(OCCASION_SECTIONS).flat());
  return raw.filter((k): k is SectionKey => typeof k === 'string' && all.has(k));
}

/**
 * Every part this occasion has, and what may be done about each one.
 *
 * Only the design's ticks are asked, because the ticks are the whole of what
 * the renderer asks. A drawn page is not the same question: Baby Blue's
 * programme page carries the gift note as well, so the page appears for a
 * design that has the gift ticked and not the programme — and the programme
 * itself is still nowhere on it. A part ticked with no page drawn for it is
 * the mirror case, and it renders: the renderer gives it a page of its own on
 * the design's overflow ground. So the tick decides, and the document has no
 * say either way.
 */
export function partsOf(
  invitation: { occasion: Occasion; tier: Tier; addOns: string[]; extraSections: string[]; saveTheDateOfId?: string | null },
  template: { sections: string[]; occasion: Occasion; design?: unknown; layout?: string },
): Part[] {
  const extras = new Set(extraSectionsOf(invitation.extraSections));
  /*
   * What the design offers. A design that carries a document says so itself
   * — it names what it refuses, and everything else is offered — and only a
   * design without one is read off the column. The two must not be mixed:
   * for a document design the column is a copy kept for anything that has
   * not been taught to read the document, never a second opinion.
   */
  const doc = documentOf(template);
  const ticked = new Set<string>(doc ? offeredSections(doc, template.occasion) : template.sections);
  const saveTheDate = Boolean(invitation.saveTheDateOfId);
  const out: Part[] = [];

  for (const key of OCCASION_SECTIONS[invitation.occasion]) {
    /*
     * A part that does not belong on this card at all is not a choice: a Save
     * the Date carries the couple and the date and nothing after it, a hidden
     * section is not offered to anybody, and the extras at the end of the form
     * are the spare photographs the customer hands us — they have no page in
     * any design and are not meant to have one. Ticking `extras` on would put
     * an empty frame on the invitation and take the promise on their own form
     * back, so it is refused here rather than left to be discovered.
     */
    if (!sectionOnCard(key, invitation.occasion, saveTheDate) || !sectionOffered(key) || SECTION_BY_KEY[key].optional) continue;
    const label = sectionLabel(key, invitation.occasion);
    /*
     * Drawn by the design? A design with no ticks at all draws everything its
     * occasion offers, which is how a design says "all of it"; a design
     * ticked for another occasion does not gate this occasion's parts. Both
     * are the renderer's own rules, read the same way here so the screen and
     * the page cannot disagree.
     */
    const carried = ticked.size === 0
      || ticked.has(key)
      || !OCCASION_SECTIONS[template.occasion].includes(key);
    if (carried) {
      out.push({ key, label, state: 'carried' });
      continue;
    }
    if (extras.has(key)) {
      out.push({ key, label, state: 'added' });
      continue;
    }
    if (!sectionUnlocked(key, invitation.occasion, invitation.tier, invitation.addOns)) {
      out.push({ key, label, state: 'needs-upgrade', needs: sectionMinTier(key, invitation.occasion) });
      continue;
    }
    out.push({ key, label, state: 'addable' });
  }
  return out;
}

/**
 * Whether one part may be added, and the sentence to say when it may not.
 *
 * The screen reads `partsOf` and only offers what can be offered; this is the
 * same question asked at the door, because a screen is a courtesy and the
 * action is where it has to hold. The refusals are written out rather than
 * numbered: whoever reads one is about to tell a customer why.
 */
export function canAddPart(
  invitation: { occasion: Occasion; tier: Tier; addOns: string[]; extraSections: string[]; saveTheDateOfId?: string | null },
  template: { sections: string[]; occasion: Occasion },
  key: string,
): { ok: true; label: string } | { ok: false; why: string } {
  const part = partsOf(invitation, template).find((p) => p.key === key);
  if (!part) return { ok: false, why: 'That part is not one this occasion has.' };
  if (part.state === 'carried') return { ok: false, why: `${part.label} is already drawn by this design, so there is nothing to add.` };
  if (part.state === 'added') return { ok: false, why: `${part.label} is already on this invitation.` };
  if (part.state === 'needs-upgrade') {
    return {
      ok: false,
      why: `${part.label} is included from ${TIER_LABELS[part.needs!]}, and this invitation is on ${TIER_LABELS[invitation.tier]}. Move the package up or sell the add-on first — adding the part here does not buy it.`,
    };
  }
  return { ok: true, label: part.label };
}
