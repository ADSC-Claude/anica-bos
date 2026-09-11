import { ONE_SCREEN, BROWSER_BAR, LEGIBLE_CQW, MAX_GROUND, WIDEST_COLUMN, BABYBLUE_GROUNDS } from './design';

/**
 * What to export artwork at.
 *
 * Everything here is derived from the numbers the studio and the renderer
 * already work in, so the guide cannot drift from the thing it describes:
 * the widest a page is ever drawn, what one screen's proportion is, the
 * band a phone's browser keeps, the smallest readable type, and the
 * proportions of the ten grounds that shipped.
 *
 * Two widths are quoted for each shape. 1080 is what Canva exports at by
 * default and is plenty — a page is drawn at most 512 CSS pixels wide, so
 * 1080 is already two pixels for every one. The larger is the cap the
 * studio re-encodes to, for artwork with fine detail in it.
 */

export type Shape = {
  key: string;
  label: string;
  /** height over width */
  ratio: number;
  /** what it is for, in the owner's terms */
  use: string;
};

/** A page is as tall as it is because of what it holds; these are the four that recur. */
export const PAGE_SHAPES: Shape[] = [
  { key: 'screen', label: 'One screen', ratio: ONE_SCREEN, use: 'A cover, or a page that is one picture and a few words.' },
  { key: 'screen-half', label: 'One and a half screens', ratio: round(ONE_SCREEN * 1.5), use: 'A page with a heading and a short list under it.' },
  { key: 'two', label: 'Two screens', ratio: round(ONE_SCREEN * 2), use: 'A page of photographs, or a programme.' },
  { key: 'three', label: 'Three screens', ratio: 2.989, use: 'A long page, scrolled: Baby Blue’s cover, story and closing are all this shape.' },
];

function round(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

/** The two sizes to export a shape at, in whole pixels. */
export function pixelsFor(ratio: number): { small: [number, number]; large: [number, number] } {
  const at = (w: number): [number, number] => [w, Math.round(w * ratio)];
  return { small: at(1080), large: at(MAX_GROUND) };
}

/** The Canva custom size to type in, which is the same pair of numbers. */
export const canvaSize = (ratio: number): string => {
  const [w, h] = pixelsFor(ratio).small;
  return `${w} × ${h} px`;
};

/**
 * What each kind of page wants, and what it does with what it is given.
 *
 * The distinction that matters most is the first one: a drawn page is
 * exactly its ground's height and everything on it is placed by hand; a
 * flow page is as tall as its words and its ground is cut in three so the
 * artwork keeps its shape when it stretches.
 */
export const KINDS: { label: string; wants: string }[] = [
  {
    label: 'A drawn page',
    wants: 'Its height is the picture’s own proportions, so export the artwork at the exact shape you want the page to be. Anything placed on it — frames, words, shapes — is placed by hand and stays where you put it at every phone size.',
  },
  {
    label: 'A flow page',
    wants: 'Its height comes from the customer’s words, so it can run past the picture. The studio cuts the ground in three on upload — the head and foot kept whole, the band between them stretched — so keep the middle of the artwork plain and put the detail near the top and the bottom.',
  },
  {
    label: 'A page that grows',
    wants: 'A drawn page whose proportions are a floor rather than a measurement. Same artwork as a flow page: plain through the middle band, which is what stretches.',
  },
  {
    label: 'A piece',
    wants: 'A bow, a cloud, a flourish: export it with transparency, cropped tight to the drawing. It keeps its own proportions wherever it is placed, and it gets no card behind it.',
  },
];

/** The rules of thumb that are about weight and legibility rather than size. */
export const RULES: string[] = [
  `A page is drawn at most ${WIDEST_COLUMN} pixels across on the widest screen a guest uses, so 1080 across is already two pixels for every one. Nothing needs more than ${MAX_GROUND}, and the studio re-encodes anything wider.`,
  'Keep a ground under about 400 KB. Ten pages at 400 KB is four megabytes, which is a slow minute on a phone at a reception.',
  `A phone shows about ${Math.round((1 - BROWSER_BAR) * 100)}% of a page before the guest scrolls, so nothing that has to be seen at once belongs in the last tenth of a one-screen page. The studio draws that band on the canvas.`,
  `Type under ${LEGIBLE_CQW}% of the page’s width is hard to read on a small phone, and the checklist says so.`,
  'Export as PNG where there is transparency and JPEG where there is none; the studio re-encodes both to WebP on the way in.',
];

/** The shipped grounds, as worked examples of the shapes above. */
export function shippedExamples(): { name: string; size: string; ratio: number }[] {
  return Object.entries(BABYBLUE_GROUNDS).map(([key, g]) => ({
    name: `Baby Blue — ${key}`,
    size: canvaSize(g.ratio),
    ratio: g.ratio,
  }));
}
