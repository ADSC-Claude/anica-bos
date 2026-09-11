/**
 * The clothing colour palette — the colours a couple picks from for the dress
 * code: the motif (four to eight), the suits and the gowns. Each has a name,
 * so the form reads "Dusty Rose" and "Sage" rather than hex, and the guest
 * page can say the name under the swatch. The values were read off the
 * designer's palette sheet, family by family; the metallics are drawn with a
 * sheen. The presets are the sheet's "trending colour families": four colours
 * that go together, picked in one tap and added to from the palette.
 *
 * What is stored on the invitation is still the hex, so a colour saved before
 * the palette existed keeps working — it simply has no name.
 */
export type Swatch = { key: string; name: string; hex: string; /** drawn with a sheen on the page */ metallic?: boolean };
export type SwatchGroup = { key: string; label: string; swatches: Swatch[] };
export type Preset = { key: string; name: string; /** swatch keys, four of them */ colours: string[] };

export const MOTIF_MIN = 4;
export const MOTIF_MAX = 8;

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '-');
const group = (key: string, label: string, rows: [string, string, string?][], metallic = false): SwatchGroup => ({
  key,
  label,
  swatches: rows.map(([name, hex, k]) => ({ key: k ?? keyOf(name), name, hex, ...(metallic ? { metallic: true } : {}) })),
});

export const PALETTE: SwatchGroup[] = [
  group('neutrals', 'Whites & neutrals', [
    ['White', '#ffffff'], ['Off White', '#f7f5f0'], ['Ivory', '#fcf8eb'], ['Cream', '#fef5df'], ['Ecru', '#faf1e4'], ['Champagne', '#f0e1c9'],
    ['Beige', '#ead4bf'], ['Nude', '#ead0bd'], ['Sand', '#dcccc0'], ['Khaki', '#d5bfa7'], ['Kaupe', '#cdbbaa'], ['Taupe', '#c8b9ac'], ['Greige', '#c5b4a6'],
  ]),
  group('pinks', 'Pinks', [
    ['Baby Pink', '#fbe4e7'], ['Pastel Pink', '#fddce1'], ['Blush', '#f8cfcc'], ['Dusty Pink', '#f3c8c7'], ['Dusty Rose', '#dba8a8'], ['Rose Pink', '#e0abb3'],
    ['Old Rose', '#ca9ba1'], ['Mauve Pink', '#d4a1aa'], ['Salmon', '#f4a99f'], ['Hot Pink', '#f73b8e'], ['Fuchsia', '#cc1b72'],
  ]),
  group('reds', 'Reds & wines', [
    ['Red', '#b9202f'], ['Scarlet', '#c81921'], ['Cherry', '#a31727'], ['Ruby', '#9e172f'], ['Crimson', '#80092c'],
    ['Burgundy', '#661129'], ['Wine', '#5f1b2d'], ['Maroon', '#582120'], ['Oxblood', '#512120'],
  ]),
  group('oranges', 'Peach, orange & terracotta', [
    ['Peach', '#fdc1a6'], ['Apricot', '#fdbca0'], ['Coral', '#fa9b8c'], ['Salmon', '#fba78f', 'salmon-orange'],
    ['Orange', '#f47940'], ['Burnt Orange', '#c76b43'], ['Terracotta', '#b36446'], ['Rust', '#b55838'],
  ]),
  group('yellows', 'Yellows', [
    ['Butter Yellow', '#fef4c0'], ['Pastel Yellow', '#feefac'], ['Lemon', '#fef098'], ['Canary', '#fddc56'], ['Mustard', '#d5a546'], ['Golden Yellow', '#e6b244'],
  ]),
  group('greens-light', 'Greens (light)', [['Mint', '#dbf3e2'], ['Pastel Green', '#ccdcc8'], ['Pistachio', '#c4cca9'], ['Sage', '#a2aa8b']]),
  group('greens-deep', 'Greens (deep)', [
    ['Eucalyptus', '#6c9385'], ['Olive', '#727955'], ['Moss', '#6c7550'], ['Emerald', '#026742'], ['Forest Green', '#1b5039'], ['Hunter Green', '#024f3c'], ['Teal', '#0f8288'],
  ]),
  group('blues', 'Blues', [
    ['Baby Blue', '#cde3fc'], ['Powder Blue', '#bbd6f0'], ['Sky Blue', '#9ec9ef'], ['Dusty Blue', '#8fa6c7'], ['Cornflower', '#84a3d6'],
    ['Periwinkle', '#a6a2e0'], ['Cobalt', '#1550b4'], ['Royal Blue', '#053b99'], ['Navy', '#1c2e56'], ['Midnight Blue', '#1c2c4b'],
  ]),
  group('purples', 'Purples', [
    ['Lavender', '#dbc7ef'], ['Lilac', '#d8ccf1'], ['Mauve', '#c197ac'], ['Orchid', '#cb93b7'], ['Wisteria', '#c3b2e2'],
    ['Violet', '#9772ad'], ['Amethyst', '#8b599c'], ['Plum', '#713e68'], ['Eggplant', '#492153'],
  ]),
  group('browns', 'Browns & earth tones', [
    ['Tan', '#d9b89c'], ['Camel', '#cda480'], ['Caramel', '#ba8d6e'], ['Cinnamon', '#b97753'], ['Mocha', '#7b5e4e'],
    ['Coffee', '#73594b'], ['Cocoa', '#765b4d'], ['Chocolate', '#432a1e'], ['Espresso', '#32231c'],
  ]),
  group('grays', 'Grays', [
    ['Pearl Gray', '#e0dfdf'], ['Dove Gray', '#d8d7d7'], ['Light Gray', '#cbcbcc'], ['Silver Gray', '#b8b8b9'],
    ['Steel Gray', '#8a8b8c'], ['Slate', '#6d7073'], ['Charcoal', '#484848'], ['Graphite', '#454545'],
  ]),
  group('blacks', 'Blacks', [['Black', '#000000'], ['Soft Black', '#1a1a1a']]),
  group('metallics', 'Metallics', [
    ['Gold', '#dcb46b'], ['Champagne Gold', '#e9d5bf'], ['Rose Gold', '#e8baa4'], ['Silver', '#c4c6c8', 'silver-metallic'], ['Bronze', '#c8824d'], ['Copper', '#d89b6a'],
  ], true),
];

export const SWATCHES: Swatch[] = PALETTE.flatMap((g) => g.swatches);
const BY_HEX = new Map(SWATCHES.map((s) => [s.hex, s]));
const BY_KEY = new Map(SWATCHES.map((s) => [s.key, s]));

/** The sheet's trending colour families: four colours that go together, by swatch key. */
export const PRESETS: Preset[] = [
  { key: 'pastels', name: 'Pastels', colours: ['baby-pink', 'powder-blue', 'mint', 'lavender'] },
  { key: 'neutrals', name: 'Neutrals', colours: ['cream', 'taupe', 'light-gray', 'silver-gray'] },
  { key: 'earth', name: 'Earth tones', colours: ['cinnamon', 'caramel', 'mocha', 'olive'] },
  { key: 'jewel', name: 'Jewel tones', colours: ['emerald', 'navy', 'burgundy', 'eggplant'] },
  { key: 'warm', name: 'Warm tones', colours: ['red', 'coral', 'golden-yellow', 'lemon'] },
  { key: 'cool', name: 'Cool tones', colours: ['cornflower', 'eucalyptus', 'sky-blue', 'violet'] },
  { key: 'autumn', name: 'Autumn tones', colours: ['rust', 'cinnamon', 'mustard', 'moss'] },
  { key: 'tropical', name: 'Tropical / brights', colours: ['hot-pink', 'canary', 'coral', 'teal'] },
  { key: 'garden', name: 'Garden', colours: ['powder-blue', 'silver-gray', 'sage', 'moss'] },
  { key: 'monochrome', name: 'Monochromatic', colours: ['dusty-blue', 'slate', 'pearl-gray', 'dove-gray'] },
  { key: 'classic', name: 'Classic', colours: ['black', 'white', 'ivory', 'gold'] },
];

/** The palette's swatch for a stored colour, if it is one of them. */
export function swatchByHex(hex: string): Swatch | undefined {
  return BY_HEX.get(hex.trim().toLowerCase());
}

/** The swatch's name, or nothing for a colour that is not in the palette. */
export function swatchName(hex: string): string {
  return swatchByHex(hex)?.name ?? '';
}

/** A swatch's colour by its key — how the code names a colour without writing a hex. */
export function swatchHex(key: string): string {
  const s = BY_KEY.get(key);
  if (!s) throw new Error(`No swatch "${key}" in the palette.`);
  return s.hex;
}

/** A preset's colours as hex, in its order. */
export function presetColours(preset: Preset): string[] {
  return preset.colours.map(swatchHex);
}

const mix = (hex: string, to: number, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount) + to * amount).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};

/** The CSS background for a swatch: the colour, or a sheen for a metallic. */
export function swatchStyle(hex: string, metallic = false): string {
  if (!metallic || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `linear-gradient(135deg, ${mix(hex, 255, 0.45)} 0%, ${hex} 48%, ${mix(hex, 0, 0.28)} 100%)`;
}

/**
 * The six colour roles, made from one family of the book in one tap.
 *
 * A design's palette is six colours that have to work together: a ground, a
 * surface, ink to read, a muted ink, and two accents. Picking six by hand
 * from two hundred swatches is a long afternoon; picking a family is a
 * decision a person can make in a second, and one family's shades work
 * together by construction — that is what a family is.
 *
 * The shape of it: the palest shade is the ground, the second palest is the
 * quiet accent, the darkest is the ink, and the two from the middle are the
 * muted ink and the accent that carries the headings. The surface stays
 * white, because a card has to lift off the page whatever the family is.
 *
 * Two guards, and both are about being able to read the page. A family of
 * pale shades has no shade dark enough to read as ink — every neutral in the
 * book is paler than the grey a person can read comfortably — so where the
 * darkest shade is still pale, the ink is the book's own near-black instead.
 * And a family of deep shades has nothing pale enough to be a ground: the
 * palest red in the book is a pillar-box red, and ink on it cannot be read
 * at all, so the ground becomes a very pale tint of that shade, which is
 * what a designer reaches for anyway. A palette that cannot be read is not
 * a palette.
 */
export const READABLE_INK = '#2b2b28';

/** 0 for black, 1 for white: the eye's own weighting of the channels. */
export function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** How pale the darkest shade may be and still read as ink. */
const INK_CEILING = 0.36;
/** How deep the palest shade may be and still be a page to read on. */
const GROUND_FLOOR = 0.62;
/** How far toward white a deep shade is taken to become a ground. */
const TINT = 0.86;

export function familyPalette(family: string): { bg: string; surface: string; ink: string; muted: string; accent: string; accent2: string } {
  const group = PALETTE.find((g) => g.key === family);
  if (!group || !group.swatches.length) throw new Error(`No colour family "${family}" in the book.`);
  const shades = [...group.swatches].sort((a, b) => lightness(b.hex) - lightness(a.hex)).map((s) => s.hex);
  const at = (i: number) => shades[Math.min(Math.max(i, 0), shades.length - 1)];
  const darkest = at(shades.length - 1);
  const palest = at(0);
  const middle = Math.floor((shades.length - 1) / 2);
  return {
    bg: lightness(palest) >= GROUND_FLOOR ? palest : mix(palest, 255, TINT),
    surface: '#ffffff',
    ink: lightness(darkest) <= INK_CEILING ? darkest : READABLE_INK,
    muted: at(middle),
    accent: at(middle + 1),
    accent2: at(1),
  };
}

/** The families, for a picker: the key, the name, and what it would make. */
export function colourFamilies(): { key: string; label: string; palette: ReturnType<typeof familyPalette> }[] {
  return PALETTE.filter((g) => g.swatches.length >= 3).map((g) => ({ key: g.key, label: g.label, palette: familyPalette(g.key) }));
}

/**
 * The contrast between two colours: 1 is none at all, 21 is black on white.
 *
 * The standards' own ratio, which is not the difference of the two
 * lightnesses above: the eye's response to light is not linear, so each
 * channel is straightened out first (the sRGB transfer function) before the
 * three are weighted. It matters at the ends — two pale colours can look
 * far apart and be 1.2 apart — which is exactly where a page stops being
 * readable. Under 3 is where words the size of a heading stop being
 * comfortable and under 4.5 where body words do.
 */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channel = (shift: number) => {
      const c = ((n >> shift) & 255) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
