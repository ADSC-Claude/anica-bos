import type { Occasion, Tier } from '@prisma/client';
import { sectionOrder, sectionUnlocked, sectionFilled, sectionAlwaysShows, publishProblems, coverImage, str, SECTION_BY_KEY, type Content, type SectionKey } from './sections';

/**
 * The Get-started list at the top of the form.
 *
 * Six lines, and every tick is earned by the invitation itself rather than
 * by a button: the cover is ticked when the names, the date and the place
 * are in, the photos when a cover photograph is up. "Done" presses count
 * only on the one line where they mean something — a part left empty on
 * purpose is still a decision, and marking it done is how the customer
 * records it. Pure, so the form, the tests and the tour read one list.
 */
export type ChecklistLine = {
  key: 'cover' | 'dates' | 'photos' | 'words' | 'rsvp' | 'publish';
  label: string;
  hint: string;
  done: boolean;
  /** Where to go to earn the tick. */
  href: string;
};

export type ChecklistInput = {
  id: string;
  occasion: Occasion;
  content: Content;
  tier: Tier;
  addOns: string[];
  status: string;
  saveTheDate: boolean;
  layout: string;
  /** The parts the customer has marked done. */
  done: SectionKey[];
};

/**
 * The parts "Your words" waits on: the ones with something to write, that
 * disappear when left empty. The cover, the RSVP and the countdown are
 * always on the page and have lines of their own; the switches (music,
 * guestbook, guest photos) and the spare photographs are not writing.
 */
const NOT_WORDS = new Set<SectionKey>(['cover', 'countdown', 'rsvp', 'extras', 'music', 'guestbook', 'photos']);

export function wordSections(occasion: Occasion, layout: string, tier: Tier, addOns: string[]): SectionKey[] {
  return sectionOrder(occasion, layout).filter((k) => !NOT_WORDS.has(k) && !SECTION_BY_KEY[k].hidden && !sectionAlwaysShows(k) && sectionUnlocked(k, occasion, tier, addOns));
}

export function checklistFor(inv: ChecklistInput): ChecklistLine[] {
  const base = `/account/invitations/${inv.id}`;
  const step = (key: SectionKey) => `${base}?section=${key}`;
  const c = inv.content;
  const coverOk = !publishProblems(inv.occasion, c).some((p) => p.startsWith('Cover:'));
  const words = wordSections(inv.occasion, inv.layout, inv.tier, inv.addOns);
  const unfinished = words.find((k) => !sectionFilled(k, inv.occasion, c[k]) && !inv.done.includes(k));
  const lines: ChecklistLine[] = [
    { key: 'cover', label: 'Your cover', hint: 'The names, the date and the place — the first screen your guests see.', done: coverOk, href: step('cover') },
    { key: 'dates', label: 'Your dates', hint: 'The day you plan to send it out; everything else is counted back from it.', done: Boolean(str(c.cover, 'sendOut')), href: step('cover') },
    { key: 'photos', label: 'Your photos', hint: 'A cover photo to start with — portrait works best on phones.', done: coverImage(c) !== '', href: step('cover') },
  ];
  if (!inv.saveTheDate) {
    lines.push(
      { key: 'words', label: 'Your words', hint: 'Every part filled in, or marked done where you are leaving it out.', done: words.length > 0 && !unfinished, href: step(unfinished ?? words[0] ?? 'cover') },
      { key: 'rsvp', label: 'Your RSVP', hint: 'A deadline, and how many each guest may bring.', done: Boolean(str(c.rsvp, 'deadline')), href: step('rsvp') },
    );
  }
  lines.push({ key: 'publish', label: 'Publish and share', hint: 'Publish to get your link and your QR code.', done: inv.status === 'PUBLISHED', href: `${base}/share` });
  return lines;
}
