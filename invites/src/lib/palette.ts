/**
 * The clothing colour palette — the colours a couple picks from for the dress
 * code: the motif (four to eight), the suits and the gowns. Each has a name,
 * so the form reads "Dusty Rose" and "Sage" rather than hex, and the guest
 * page can say the name under the swatch. The values were read off the
 * designer's palette sheet; the metallics are drawn with a sheen.
 *
 * What is stored on the invitation is still the hex, so a colour saved before
 * the palette existed keeps working — it simply has no name.
 */
export type Swatch = { key: string; name: string; hex: string; /** drawn with a sheen on the page */ metallic?: boolean };
export type SwatchGroup = { key: string; label: string; swatches: Swatch[] };

export const MOTIF_MIN = 4;
export const MOTIF_MAX = 8;

const group = (key: string, label: string, rows: [string, string, string?][]): SwatchGroup => ({
  key,
  label,
  swatches: rows.map(([name, hex, k]) => ({ key: k ?? name.toLowerCase().replace(/[^a-z]+/g, '-'), name, hex })),
});

export const PALETTE: SwatchGroup[] = [
  group('neutrals', 'Whites & neutrals', [
    ['White', '#ffffff'], ['Ivory', '#fcf6eb'], ['Cream', '#fef2d9'], ['Champagne', '#eddec3'], ['Beige', '#e5cdb7'],
    ['Nude', '#e5cab5'], ['Taupe', '#cebdaf'], ['Greige', '#c5b4a7'], ['Stone', '#d5c7ba'], ['Sand', '#d4c2ae'],
  ]),
  group('pinks', 'Pinks', [
    ['Baby Pink', '#fddee2'], ['Blush', '#f6cbc3'], ['Dusty Rose', '#daa8a6'], ['Rose Pink', '#dea4aa'], ['Mauve', '#c598a0'],
    ['Old Rose', '#cd9c9b'], ['Peony', '#d77f8f'], ['Hot Pink', '#fb2b84'], ['Fuchsia', '#c90268'],
  ]),
  group('reds', 'Reds & wines', [
    ['Red', '#cb1d2d'], ['Scarlet', '#cd1b20'], ['Cherry', '#9d0f17'], ['Burgundy', '#760e27'], ['Wine', '#541722'],
    ['Maroon', '#4b1c19'], ['Rust', '#b3553c'], ['Terracotta', '#ba5b3f'], ['Brick', '#9e4a33'],
  ]),
  group('oranges', 'Oranges & yellows', [
    ['Peach', '#fec7ae'], ['Coral', '#fc9c8a'], ['Apricot', '#fdb182'], ['Orange', '#f17032'], ['Burnt Orange', '#b34f23'],
    ['Mustard', '#cd9e3e'], ['Butter Yellow', '#fef5b7'], ['Lemon', '#feef84'], ['Golden Yellow', '#f6c24b'],
  ]),
  group('greens', 'Greens', [
    ['Mint', '#d4f2dd'], ['Sage', '#bccdb8'], ['Pistachio', '#b9c59a'], ['Olive', '#838963'], ['Eucalyptus', '#5f8979'],
    ['Emerald', '#047252'], ['Forest Green', '#12462f'], ['Hunter Green', '#074632'], ['Teal', '#067f8b'],
  ]),
  group('blues', 'Blues', [
    ['Baby Blue', '#c7e1f8'], ['Powder Blue', '#b5d3ed'], ['Sky Blue', '#95c5ec'], ['Dusty Blue', '#849cbd'], ['Cornflower', '#5e88bd'],
    ['Periwinkle', '#7386d6'], ['Royal Blue', '#023d9c'], ['Navy', '#10234f'], ['Denim Blue', '#395676'],
  ]),
  group('purples', 'Purples', [
    ['Lavender', '#d5c7ed'], ['Lilac', '#dac6ef'], ['Mauve', '#b991a3', 'mauve-purple'], ['Orchid', '#be89a6'], ['Plum', '#7a4b74'],
    ['Violet', '#7c6fb7'], ['Amethyst', '#8256a2'], ['Eggplant', '#4c224c'], ['Deep Purple', '#3a2360'],
  ]),
  group('browns', 'Browns & earth tones', [
    ['Sand', '#dcc8b1', 'sand-brown'], ['Camel', '#c9a07a'], ['Caramel', '#b17c5e'], ['Mocha', '#927362'], ['Taupe Brown', '#887469'],
    ['Cocoa', '#55382b'], ['Chocolate', '#3f2b22'], ['Espresso', '#2c231f'], ['Warm Gray-Brown', '#8c7972'],
  ]),
  group('grays', 'Grays & silvers', [
    ['Pearl Gray', '#d9d9d9'], ['Dove Gray', '#c9c9c9'], ['Light Gray', '#b5b5b5'], ['Steel Gray', '#919191'], ['Charcoal', '#4e4e4e'],
    ['Graphite', '#595959'], ['Silver', '#cdcdcd'], ['Slate', '#6f7982'], ['Gunmetal', '#565656'],
  ]),
  group('blacks', 'Blacks', [['Black', '#000000'], ['Soft Black', '#1a1a1a'], ['Off Black', '#262626']]),
  {
    key: 'metallics',
    label: 'Metallics',
    swatches: ([
      ['Gold', '#dfbb74', 'gold'], ['Champagne Gold', '#e6d3bb', 'champagne-gold'], ['Rose Gold', '#dfb09c', 'rose-gold'],
      ['Silver', '#d4d6da', 'silver-metallic'], ['Bronze', '#c6895a', 'bronze'], ['Copper', '#d9a680', 'copper'],
    ] as [string, string, string][]).map(([name, hex, key]) => ({ key, name, hex, metallic: true })),
  },
];

export const SWATCHES: Swatch[] = PALETTE.flatMap((g) => g.swatches);
const BY_HEX = new Map(SWATCHES.map((s) => [s.hex, s]));

/** The palette's swatch for a stored colour, if it is one of them. */
export function swatchByHex(hex: string): Swatch | undefined {
  return BY_HEX.get(hex.trim().toLowerCase());
}

/** The swatch's name, or nothing for a colour that is not in the palette. */
export function swatchName(hex: string): string {
  return swatchByHex(hex)?.name ?? '';
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
