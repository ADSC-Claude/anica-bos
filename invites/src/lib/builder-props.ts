import type { Occasion, Role, Tier } from '@prisma/client';
import {
  readForward, sectionOrder, sectionLabel, sectionMinTier, sectionUnlocked, sectionFilled, sectionAlwaysShows,
  fieldsFor, customerFields, emptySection, photoFrames, photoFramesHint, SECTION_BY_KEY, SAVE_THE_DATE_SECTIONS,
  type Content, type SectionKey,
} from './sections';
import { documentOf } from './design';
import { designForm, askedFields, askedLimits, designMedia } from './asks';
import { isStaff } from './rbac';
import { galleryLimit } from './tiers';
import { changeWindow, doneSections, type Progress } from './progress';

/**
 * What the form is told about one part of one invitation.
 *
 * The form is drawn in two places now — the Invitation tab, and the studio,
 * where she edits a customer's words beside the page they land on — and the
 * two have to agree on every particular: which parts this card has and in
 * what order, which the package unlocks, which fields are the customer's
 * and which are ours, how many photographs the page holds, and whether the
 * three-week window has closed. So it is worked out once, here, from the
 * invitation row alone. Nothing here touches the database or the session,
 * which is what lets a page compute it and a server action answer with it.
 */
export type BuilderSection = { key: SectionKey; label: string; description: string; unlocked: boolean; filled: boolean; minTier: Tier };

/** The invitation row as the form needs it: its own columns, and the design it is drawn on. */
export type BuilderPropsInput = {
  id: string;
  slug: string;
  status: string;
  occasion: Occasion;
  tier: Tier;
  addOns: string[];
  language: string;
  content: unknown;
  eventAt: Date | null;
  saveTheDateOfId: string | null;
  template: { layout: string; design?: unknown };
};

/** The content column as stored: the parts, plus the look chosen and the parts marked done. */
type Stored = Content & { theme?: { lookKey?: string }; progress?: Progress };

export type BuilderProps = ReturnType<typeof builderPropsFor>;

export function builderPropsFor(role: Role, inv: BuilderPropsInput, section?: string) {
  // readForward, as contentOf does: a part whose shape changed since this
  // invitation was saved is read into the shape the spec names today.
  const content = readForward((inv.content && typeof inv.content === 'object' ? inv.content : {}) as Stored);
  const std = Boolean(inv.saveTheDateOfId);
  const keys = sectionOrder(inv.occasion, inv.template.layout).filter((k) => !std || SAVE_THE_DATE_SECTIONS.includes(k));
  const defs = keys.map((k) => SECTION_BY_KEY[k]).filter((d) => !d.hidden);
  const sections: BuilderSection[] = defs.map((d) => ({
    key: d.key,
    label: sectionLabel(d.key, inv.occasion),
    description: d.description,
    unlocked: sectionUnlocked(d.key, inv.occasion, inv.tier, inv.addOns),
    filled: sectionFilled(d.key, inv.occasion, content[d.key]),
    minTier: sectionMinTier(d.key, inv.occasion),
  }));
  // The part asked for, if it is open; else the first that is.
  const current = (sections.find((x) => x.key === section && x.unlocked)?.key ?? sections.find((x) => x.unlocked)!.key) as SectionKey;
  /*
   * The form this design asks for. A design that says nothing gives back the
   * very fields it was handed, so every invitation on a design with no
   * document of its own sees exactly the form it saw before. The fixed
   * writings are ours: staff editing for the customer see them, the customer
   * does not.
   */
  const form = designForm(documentOf(inv.template), inv.occasion);
  const all = designMedia(fieldsFor(current, inv.occasion, inv.tier, std), current, form);
  const own = isStaff(role) ? all : customerFields(all);
  const fields = askedFields(own, current, form);
  const initial = { ...emptySection(fields), ...(content[current] ?? {}) };
  const limit = galleryLimit(inv.tier);
  const w = changeWindow(inv.eventAt);
  return {
    sections,
    current,
    fields,
    initial,
    done: doneSections(content.progress),
    hidesWhenEmpty: !sectionAlwaysShows(current),
    completedAt: content.progress?.completedAt ?? null,
    // as strings, so the answer survives a server action as it is
    window: w ? { closesAt: w.closesAt.toISOString(), finalAt: w.finalAt.toISOString(), closed: w.closed } : null,
    lang: (inv.language === 'tl' ? 'tl' : 'en') as 'en' | 'tl',
    // finite whatever the package: a design with frames holds that many, and
    // a package without a cap holds two hundred, so a list always has a number
    listLimits: { photos: Math.min(limit === Infinity ? 200 : limit, photoFrames(inv.template.layout)), ...askedLimits(current, form) },
    listHints: photoFramesHint(inv.template.layout),
    lookKey: content.theme?.lookKey ?? '',
    tier: inv.tier,
    status: inv.status,
    slug: inv.slug,
  };
}
