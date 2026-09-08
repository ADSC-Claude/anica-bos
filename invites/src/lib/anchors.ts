import type { SectionKey } from './sections';

/**
 * Where each section lands on the guest page: the `id` its block carries in
 * the renderer, so a preview can be sent straight to it (`#story`). The
 * encoder's workspace scrolls its preview here as the segment being worked
 * on changes; the builder could do the same.
 *
 * Most sections carry their own key; the exceptions are named. A section
 * with no block of its own — music plays from the tap, the countdown sits on
 * the cover of some designs — points at the top.
 */
const ANCHORS: Partial<Record<SectionKey, string>> = {
  cover: 'top',
  countdown: 'countdown',
  parents: 'parents',
  ceremony: 'ceremony',
  reception: 'reception',
  entourage: 'entourage',
  sponsors: 'sponsors',
  eighteen: 'eighteen',
  dressCode: 'dress-code',
  gift: 'gift',
  rsvp: 'rsvp',
  story: 'story',
  gallery: 'gallery',
  program: 'program',
  faq: 'faq',
  travel: 'travel',
  social: 'social',
  music: 'top',
  guestbook: 'guestbook',
  photos: 'guest-photos',
  contact: 'contact',
  closing: 'closing',
  moment: 'moment',
  family: 'family',
  speakers: 'speakers',
};

export function sectionAnchor(key: SectionKey, layout: string): string {
  // The Baby Blue design draws its photos on a page of their own.
  if (key === 'gallery' && layout === 'babyblue') return 'baby-photos';
  return ANCHORS[key] ?? 'top';
}
