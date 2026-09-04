/**
 * The share card is a fixed 1080×1350 canvas, so when the content grows the
 * type has to shrink — there is nowhere else for it to go. Satori lays the
 * card out with a browser's rules, which means a column of content taller than
 * its box does not clip: it shrinks its items, and shrunken text boxes overlap
 * each other. That is a silent failure, and this is the image every guest sees
 * when the invitation is forwarded on Messenger.
 *
 * The one variable long enough to matter is the title. "Ana & Ben" fits on one
 * line at 96px; "Ma. Christine Anne & Christopher Emmanuel" needs three, which
 * pushes the venue off the bottom of the card.
 */
export function cardTitleSize(title: string): number {
  const length = [...title].length;
  if (length > 30) return 54;
  if (length > 22) return 66;
  if (length > 16) return 80;
  return 96;
}

/**
 * The intro is the couple's own sentence and can be any length. Two lines at
 * 30px is what the layout has budgeted for it.
 */
export const CARD_INTRO_MAX = 140;
