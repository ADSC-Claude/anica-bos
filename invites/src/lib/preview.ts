/**
 * What the template form would save, read straight off the form.
 *
 * The form's two hardest fields are the palette and the pairing, and until
 * now the rule for turning them into stored columns lived in one place only:
 * inside `saveTemplateAction`. That was fine while the only way to see the
 * result was to press Save. It is not fine now that a panel beside the form
 * draws the design *as the form stands*, because a preview that reads the
 * fields by its own rule is a preview that can disagree with Save — and a
 * preview which disagrees with Save is worse than none at all.
 *
 * So the rule lives here, once, and both callers ask it the same question
 * through a getter: the action hands it `FormData`, the preview route hands
 * it the query string it was given. Neither has a copy of the rule.
 */
import { PALETTE_PRESETS, FONT_PRESETS, type Palette, type Fonts } from './theme';
import { colourFamilies } from './palette';

/** The six roles, in the order the form lays them out. */
export const COLOUR_ROLES = ['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as const;

/** Every field of the form the preview follows. Anything else is read off the saved row. */
export const PREVIEW_FIELDS = [...COLOUR_ROLES, 'paletteKey', 'paletteFamily', 'fontsKey', 'look', 'layout', 'occasion'] as const;

export type FieldReader = (key: string) => string;

/**
 * The six colours.
 *
 * The six boxes win when they are filled, because they are the particular
 * answer and somebody typed them. With the boxes empty, a colour family of
 * the book beats a preset — a family is a choice made among a hundred and
 * thirty-five shades, a preset is one of six — and with neither, the boxes
 * go back as they came: empty, which `paletteFrom` reads as the house ivory.
 */
export function paletteFromForm(get: FieldReader): Palette {
  const six = Object.fromEntries(COLOUR_ROLES.map((k) => [k, get(k)])) as Palette;
  if (six.bg) return six;
  const family = colourFamilies().find((f) => f.key === get('paletteFamily'))?.palette;
  if (family) return family;
  return PALETTE_PRESETS.find((p) => p.key === get('paletteKey'))?.palette ?? six;
}

/** The pairing of faces, falling back to the first preset as the form's select does. */
export function fontsFromForm(get: FieldReader): Fonts {
  return FONT_PRESETS.find((f) => f.key === get('fontsKey'))?.fonts ?? FONT_PRESETS[0].fonts;
}

/**
 * The sitter's own content, with the customer's theme taken out.
 *
 * The preview stands the design on a real invitation, and an invitation may
 * carry colours and a pairing of its own: `resolveTheme` lets the customer's
 * choice win over the design's, which is right on a guest's page and exactly
 * wrong here. Left in, the panel would answer every colour she typed with
 * the sitter's colours and look like it was working.
 *
 * Day or night is the one thing kept, because night is the design's own
 * second palette and she has to be able to look at it.
 */
export function sitterContent<T extends { theme?: unknown }>(content: T, mode: 'day' | 'night'): T {
  return { ...content, theme: mode === 'night' ? { mode: 'night' } : undefined };
}
