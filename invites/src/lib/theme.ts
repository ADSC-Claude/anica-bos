/**
 * A template's look is a palette and a pair of fonts, applied as CSS variables
 * on the invitation root. The renderer never hard-codes a colour, so a
 * customer on the Standard tier can pick another preset and a Signature
 * customer can type their own hex values — and the same section markup
 * re-skins itself.
 */
export type Palette = {
  /** Page ground. */
  bg: string;
  /** Cards and panels. */
  surface: string;
  /** Body text. */
  ink: string;
  /** Muted text, captions. */
  muted: string;
  /** Headings and buttons. */
  accent: string;
  /** Rules, small decorations. */
  accent2: string;
};

export type Fonts = {
  display: string;
  body: string;
  /** The names on the cover, when they are set in a face of their own. */
  names?: string;
  /** The line under a heading, when a design writes one. */
  script?: string;
  /** The script face's slant: an italic serif can play the part of a script. */
  scriptStyle?: 'normal' | 'italic';
  /**
   * Google Fonts families to load, e.g. ["Cormorant Garamond", "Jost"]. A
   * family may carry its own axis spec after a colon ("Lora:ital,wght@0,400;1,400")
   * when the default weights are not what the look needs.
   */
  load: string[];
};

export const PALETTE_PRESETS: { key: string; label: string; palette: Palette; muted?: boolean }[] = [
  { key: 'ivory', label: 'Ivory & Sage', palette: { bg: '#faf7f2', surface: '#ffffff', ink: '#2b2b28', muted: '#6b6a61', accent: '#5b6b4e', accent2: '#c9b48a' } },
  { key: 'white', label: 'Warm White & Taupe', palette: { bg: '#fdfbf7', surface: '#ffffff', ink: '#2c2825', muted: '#7b736a', accent: '#8a7a66', accent2: '#d8cdbb' } },
  { key: 'champagne', label: 'White & Champagne', palette: { bg: '#fbf8f3', surface: '#ffffff', ink: '#2e2a24', muted: '#7a7167', accent: '#b39456', accent2: '#e4d7bd' } },
  { key: 'linen', label: 'Linen & Ash', palette: { bg: '#f7f5f1', surface: '#ffffff', ink: '#2a2a28', muted: '#75746f', accent: '#5f5d57', accent2: '#cfcabd' } },
  { key: 'capiz', label: 'Capiz & Bronze', palette: { bg: '#f6f1e8', surface: '#fffdf8', ink: '#4a3b2c', muted: '#8b7a64', accent: '#a8763f', accent2: '#d8c6a0' } },
  { key: 'blush', label: 'Blush & Gold', palette: { bg: '#fbf4f2', surface: '#ffffff', ink: '#3a2e2e', muted: '#7a6a6a', accent: '#a6555e', accent2: '#d3b06c' } },
  { key: 'navy', label: 'Navy & Champagne', palette: { bg: '#f6f4ef', surface: '#ffffff', ink: '#1f2a3d', muted: '#5d6675', accent: '#1f2a3d', accent2: '#c8ad7f' } },
  { key: 'terracotta', label: 'Terracotta & Cream', palette: { bg: '#fbf6ef', surface: '#ffffff', ink: '#3b2a22', muted: '#7d6a5f', accent: '#b8603d', accent2: '#e0b98a' } },
  { key: 'emerald', label: 'Emerald & Ivory', palette: { bg: '#f5f8f5', surface: '#ffffff', ink: '#1f2d27', muted: '#5e6d66', accent: '#1e5c47', accent2: '#b9a26b' } },
  { key: 'babyblue', label: 'Baby Blue', palette: { bg: '#eef3f9', surface: '#ffffff', ink: '#4a5b7a', muted: '#8391a8', accent: '#8fb0d8', accent2: '#c9d9ec' } },
  { key: 'dusty', label: 'Dusty Blue', palette: { bg: '#f4f6f9', surface: '#ffffff', ink: '#2a3340', muted: '#66707e', accent: '#5b7a9d', accent2: '#c7b48e' } },
  { key: 'lilac', label: 'Lilac & Silver', palette: { bg: '#f8f5fb', surface: '#ffffff', ink: '#2f2a3a', muted: '#6f6980', accent: '#7c5fa3', accent2: '#b9b9c4' } },
  { key: 'sunset', label: 'Sunset Beach', palette: { bg: '#fff8f0', surface: '#ffffff', ink: '#33302b', muted: '#75705f', accent: '#e07a3f', accent2: '#5aa9a0' } },
  { key: 'pastel', label: 'Pastel Party', palette: { bg: '#fffaf3', surface: '#ffffff', ink: '#3a3a3a', muted: '#7a7a7a', accent: '#e8748a', accent2: '#8ac6d1' } },
  { key: 'royal', label: 'Royal Blue & Gold', palette: { bg: '#f5f7fb', surface: '#ffffff', ink: '#1d2340', muted: '#5d627d', accent: '#233b8a', accent2: '#d4af37' } },
  { key: 'mono', label: 'Black & White', palette: { bg: '#fafafa', surface: '#ffffff', ink: '#111111', muted: '#666666', accent: '#111111', accent2: '#bdbdbd' } },
  { key: 'slate', label: 'Quiet Slate', palette: { bg: '#f4f4f2', surface: '#ffffff', ink: '#2e2e2c', muted: '#6c6c68', accent: '#4a4a47', accent2: '#a9a9a3' }, muted: true },
];

export const FONT_PRESETS: { key: string; label: string; fonts: Fonts }[] = [
  { key: 'serif', label: 'Classic serif', fonts: { display: "'Cormorant Garamond', 'Hoefler Text', Georgia, serif", body: "'Jost', 'Segoe UI', system-ui, sans-serif", load: ['Cormorant Garamond', 'Jost'] } },
  { key: 'capiz', label: 'Capiz (Cormorant, Cinzel, Pinyon Script)', fonts: { display: "'Cormorant Garamond', 'Hoefler Text', Georgia, serif", body: "'Cormorant Garamond', Georgia, serif", load: ['Cormorant Garamond', 'Cinzel', 'Pinyon Script'] } },
  { key: 'editorial', label: 'Editorial', fonts: { display: "'Playfair Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif", load: ['Playfair Display', 'DM Sans'] } },
  { key: 'script', label: 'Script', fonts: { display: "'Great Vibes', 'Brush Script MT', cursive", body: "'Lora', Georgia, serif", load: ['Great Vibes', 'Lora'] } },
  { key: 'modern', label: 'Modern sans', fonts: { display: "'Montserrat', 'Segoe UI', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", load: ['Montserrat', 'Inter'] } },
  { key: 'playful', label: 'Playful', fonts: { display: "'Fredoka', 'Segoe UI', system-ui, sans-serif", body: "'Nunito', system-ui, sans-serif", load: ['Fredoka', 'Nunito'] } },
  // The owner's thirty pairings from her font sheets (10 September). Every
  // face Canva licenses only for use inside Canva is replaced by its nearest
  // free Google face, so nothing here needs a licence: Italiana for TAN Mon
  // Cheri, Marcellus for Black Mango, Bodoni Moda for Bauer Bodoni, Great
  // Vibes for Slight, Mrs Saint Delafield for Sloop Script, Herr Von
  // Muellerhoff for Burgues Script, Montserrat for Gotham, and so on. Where
  // the pair's second face is a script it goes in `names` and `script`, and a
  // readable face carries the body. Every `load` entry names its axes, since
  // the default weights would ask a single-weight family for weights it lacks.
  { key: 'italiana-open-sans', label: 'Italiana / Open Sans (for TAN Mon Cheri)', fonts: { display: "'Italiana', Georgia, serif", body: "'Open Sans', 'Segoe UI', system-ui, sans-serif", load: ['Italiana:wght@400', 'Open Sans:wght@400;600'] } },
  { key: 'dm-serif-dm-sans', label: 'DM Serif Display / DM Sans', fonts: { display: "'DM Serif Display', Georgia, serif", body: "'DM Sans', 'Segoe UI', system-ui, sans-serif", load: ['DM Serif Display:wght@400', 'DM Sans:wght@400;500;700'] } },
  { key: 'playfair-lato', label: 'Playfair Display / Lato', fonts: { display: "'Playfair Display', Georgia, serif", body: "'Lato', 'Segoe UI', system-ui, sans-serif", load: ['Playfair Display:wght@400;600;700', 'Lato:wght@400;700'] } },
  { key: 'marcellus-jost', label: 'Marcellus / Jost (for Black Mango / Garet)', fonts: { display: "'Marcellus', Georgia, serif", body: "'Jost', 'Segoe UI', system-ui, sans-serif", load: ['Marcellus:wght@400', 'Jost:wght@400;500;600'] } },
  { key: 'josefin-abhaya', label: 'Josefin Sans / Abhaya Libre (for Safira March)', fonts: { display: "'Josefin Sans', 'Segoe UI', system-ui, sans-serif", body: "'Abhaya Libre', Georgia, serif", load: ['Josefin Sans:wght@300;400;600', 'Abhaya Libre:wght@400;600'] } },
  { key: 'alata-poppins', label: 'Alata / Poppins', fonts: { display: "'Alata', 'Segoe UI', system-ui, sans-serif", body: "'Poppins', 'Segoe UI', system-ui, sans-serif", load: ['Alata:wght@400', 'Poppins:wght@400;500;600'] } },
  { key: 'bodoni-archivo', label: 'Bodoni Moda / Archivo Narrow (for Bauer Bodoni / Body Grotesque)', fonts: { display: "'Bodoni Moda', Georgia, serif", body: "'Archivo Narrow', 'Segoe UI', system-ui, sans-serif", load: ['Bodoni Moda:opsz,wght@6..96,400;6..96,700', 'Archivo Narrow:wght@400;500;600'] } },
  { key: 'dm-serif-allison', label: 'DM Serif Display / Allison script (for Breathing)', fonts: { display: "'DM Serif Display', Georgia, serif", body: "'DM Sans', 'Segoe UI', system-ui, sans-serif", script: "'Allison', 'Brush Script MT', cursive", load: ['DM Serif Display:wght@400', 'Allison:wght@400', 'DM Sans:wght@400;500'] } },
  { key: 'six-caps-poppins', label: 'Six Caps / Poppins', fonts: { display: "'Six Caps', 'Segoe UI', system-ui, sans-serif", body: "'Poppins', 'Segoe UI', system-ui, sans-serif", load: ['Six Caps:wght@400', 'Poppins:wght@400;500;600'] } },
  { key: 'fraunces-antonio', label: 'Fraunces / Antonio (for TAN Songbird / Moonshine)', fonts: { display: "'Fraunces', Georgia, serif", body: "'Antonio', 'Segoe UI', system-ui, sans-serif", load: ['Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900', 'Antonio:wght@400;600'] } },
  { key: 'abril-de-haviland', label: 'Abril Fatface / Mr De Haviland script (for Chloe / Moontime)', fonts: { display: "'Abril Fatface', Georgia, serif", body: "'Lato', 'Segoe UI', system-ui, sans-serif", script: "'Mr De Haviland', 'Brush Script MT', cursive", load: ['Abril Fatface:wght@400', 'Mr De Haviland:wght@400', 'Lato:wght@400;700'] } },
  { key: 'great-vibes-league-gothic', label: 'Great Vibes names / League Gothic (for Slight / League Gothic)', fonts: { display: "'League Gothic', 'Segoe UI', system-ui, sans-serif", body: "'Lato', 'Segoe UI', system-ui, sans-serif", names: "'Great Vibes', 'Brush Script MT', cursive", script: "'Great Vibes', 'Brush Script MT', cursive", load: ['League Gothic:wght@400', 'Great Vibes:wght@400', 'Lato:wght@400;700'] } },
  { key: 'cinzel-delafield', label: 'Cinzel / Mrs Saint Delafield script (for Sloop Script)', fonts: { display: "'Cinzel', Georgia, serif", body: "'Cormorant Garamond', Georgia, serif", names: "'Mrs Saint Delafield', 'Brush Script MT', cursive", script: "'Mrs Saint Delafield', 'Brush Script MT', cursive", load: ['Cinzel:wght@400;600', 'Mrs Saint Delafield:wght@400', 'Cormorant Garamond:wght@400;500;600'] } },
  { key: 'prata-ovo', label: 'Prata / Ovo (for Giaza)', fonts: { display: "'Prata', Georgia, serif", body: "'Ovo', Georgia, serif", load: ['Prata:wght@400', 'Ovo:wght@400'] } },
  { key: 'cormorant-pinyon', label: 'Cormorant / Pinyon Script', fonts: { display: "'Cormorant Garamond', Georgia, serif", body: "'Cormorant Garamond', Georgia, serif", names: "'Pinyon Script', 'Brush Script MT', cursive", script: "'Pinyon Script', 'Brush Script MT', cursive", load: ['Cormorant Garamond:wght@400;500;600;700', 'Pinyon Script:wght@400'] } },
  { key: 'noto-outfit', label: 'Noto Serif Display / Outfit (for TT Fors)', fonts: { display: "'Noto Serif Display', Georgia, serif", body: "'Outfit', 'Segoe UI', system-ui, sans-serif", load: ['Noto Serif Display:ital,wght@0,400;0,600;1,400', 'Outfit:wght@400;500;600'] } },
  { key: 'oswald-muellerhoff', label: 'Oswald / Herr Von Muellerhoff script (for Sydney / Burgues Script)', fonts: { display: "'Oswald', 'Segoe UI', system-ui, sans-serif", body: "'Lato', 'Segoe UI', system-ui, sans-serif", names: "'Herr Von Muellerhoff', 'Brush Script MT', cursive", script: "'Herr Von Muellerhoff', 'Brush Script MT', cursive", load: ['Oswald:wght@400;500;600', 'Herr Von Muellerhoff:wght@400', 'Lato:wght@400;700'] } },
  { key: 'great-vibes-inter', label: 'Great Vibes names / Inter (for Slight / Aileron)', fonts: { display: "'Inter', 'Segoe UI', system-ui, sans-serif", body: "'Inter', 'Segoe UI', system-ui, sans-serif", names: "'Great Vibes', 'Brush Script MT', cursive", script: "'Great Vibes', 'Brush Script MT', cursive", load: ['Great Vibes:wght@400', 'Inter:wght@400;500;600'] } },
  { key: 'montserrat-pinyon', label: 'Montserrat / Pinyon Script (for Gotham / Snell Roundhand)', fonts: { display: "'Montserrat', 'Segoe UI', system-ui, sans-serif", body: "'Montserrat', 'Segoe UI', system-ui, sans-serif", names: "'Pinyon Script', 'Brush Script MT', cursive", script: "'Pinyon Script', 'Brush Script MT', cursive", load: ['Montserrat:wght@400;500;600;700', 'Pinyon Script:wght@400'] } },
  { key: 'allura-antonio', label: 'Allura names / Antonio (for Luxes Script / Moonshine)', fonts: { display: "'Antonio', 'Segoe UI', system-ui, sans-serif", body: "'Lato', 'Segoe UI', system-ui, sans-serif", names: "'Allura', 'Brush Script MT', cursive", script: "'Allura', 'Brush Script MT', cursive", load: ['Antonio:wght@400;600', 'Allura:wght@400', 'Lato:wght@400;700'] } },
  { key: 'great-vibes-noto', label: 'Great Vibes names / Noto Serif Display (for Slight)', fonts: { display: "'Noto Serif Display', Georgia, serif", body: "'Noto Serif Display', Georgia, serif", names: "'Great Vibes', 'Brush Script MT', cursive", script: "'Great Vibes', 'Brush Script MT', cursive", load: ['Noto Serif Display:ital,wght@0,400;0,600;1,400', 'Great Vibes:wght@400'] } },
  { key: 'poiret-dancing', label: 'Poiret One / Dancing Script (for ST Titan / Jimmy Script)', fonts: { display: "'Poiret One', 'Segoe UI', system-ui, sans-serif", body: "'Poppins', 'Segoe UI', system-ui, sans-serif", script: "'Dancing Script', 'Brush Script MT', cursive", load: ['Poiret One:wght@400', 'Dancing Script:wght@400;600', 'Poppins:wght@400;500'] } },
  { key: 'pacifico-quicksand', label: 'Pacifico / Quicksand (for Genty)', fonts: { display: "'Pacifico', 'Brush Script MT', cursive", body: "'Quicksand', 'Segoe UI', system-ui, sans-serif", load: ['Pacifico:wght@400', 'Quicksand:wght@400;600'] } },
  { key: 'marcellus-montserrat', label: 'Marcellus / Montserrat (for Black Mango)', fonts: { display: "'Marcellus', Georgia, serif", body: "'Montserrat', 'Segoe UI', system-ui, sans-serif", load: ['Marcellus:wght@400', 'Montserrat:wght@400;500;600'] } },
  { key: 'unbounded-quicksand', label: 'Unbounded / Quicksand (for TAN Meringue)', fonts: { display: "'Unbounded', 'Segoe UI', system-ui, sans-serif", body: "'Quicksand', 'Segoe UI', system-ui, sans-serif", load: ['Unbounded:wght@400;500;700', 'Quicksand:wght@400;600'] } },
  { key: 'delafield-playfair', label: 'Mrs Saint Delafield names / Playfair Display (for Sloop Script Pro)', fonts: { display: "'Playfair Display', Georgia, serif", body: "'Playfair Display', Georgia, serif", names: "'Mrs Saint Delafield', 'Brush Script MT', cursive", script: "'Mrs Saint Delafield', 'Brush Script MT', cursive", load: ['Playfair Display:wght@400;600;700', 'Mrs Saint Delafield:wght@400'] } },
  { key: 'parisienne-roboto', label: 'Parisienne names / Roboto Condensed (for Lavonia Classy / Helios)', fonts: { display: "'Roboto Condensed', 'Segoe UI', system-ui, sans-serif", body: "'Roboto Condensed', 'Segoe UI', system-ui, sans-serif", names: "'Parisienne', 'Brush Script MT', cursive", script: "'Parisienne', 'Brush Script MT', cursive", load: ['Roboto Condensed:wght@400;600;700', 'Parisienne:wght@400'] } },
  { key: 'cormorant-michroma', label: 'Cormorant / Michroma lines (for Hello Paris)', fonts: { display: "'Cormorant Garamond', Georgia, serif", body: "'Cormorant Garamond', Georgia, serif", script: "'Michroma', 'Segoe UI', system-ui, sans-serif", load: ['Cormorant Garamond:wght@400;500;600', 'Michroma:wght@400'] } },
  { key: 'alex-brush-sanchez', label: 'Alex Brush names / Sanchez (for Symphony)', fonts: { display: "'Sanchez', Georgia, serif", body: "'Sanchez', Georgia, serif", names: "'Alex Brush', 'Brush Script MT', cursive", script: "'Alex Brush', 'Brush Script MT', cursive", load: ['Sanchez:ital,wght@0,400;1,400', 'Alex Brush:wght@400'] } },
  { key: 'bodoni-muellerhoff', label: 'Bodoni Moda / Herr Von Muellerhoff script (for Perandory / Burgues)', fonts: { display: "'Bodoni Moda', Georgia, serif", body: "'Bodoni Moda', Georgia, serif", names: "'Herr Von Muellerhoff', 'Brush Script MT', cursive", script: "'Herr Von Muellerhoff', 'Brush Script MT', cursive", load: ['Bodoni Moda:opsz,wght@6..96,400;6..96,700', 'Herr Von Muellerhoff:wght@400'] } },
];

export const LAYOUTS = ['classic', 'editorial', 'garden', 'modern', 'festive', 'quiet', 'capiz', 'babyblue'] as const;
export type Layout = (typeof LAYOUTS)[number];

export function isLayout(v: string): v is Layout {
  return (LAYOUTS as readonly string[]).includes(v);
}

export function paletteFrom(raw: unknown): Palette {
  const base = PALETTE_PRESETS.find((p) => p.key === 'ivory')!.palette;
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<Palette>;
  const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
  return {
    bg: hex(o.bg, base.bg),
    surface: hex(o.surface, base.surface),
    ink: hex(o.ink, base.ink),
    muted: hex(o.muted, base.muted),
    accent: hex(o.accent, base.accent),
    accent2: hex(o.accent2, base.accent2),
  };
}

export function fontsFrom(raw: unknown): Fonts {
  const base = FONT_PRESETS[0].fonts;
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<Fonts>;
  const face = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    display: face(o.display) ?? base.display,
    body: face(o.body) ?? base.body,
    ...(face(o.names) ? { names: face(o.names) } : {}),
    ...(face(o.script) ? { script: face(o.script) } : {}),
    ...(o.scriptStyle === 'italic' ? { scriptStyle: 'italic' as const } : {}),
    load: Array.isArray(o.load) ? o.load.filter((x): x is string => typeof x === 'string').slice(0, 4) : base.load,
  };
}

export function cssVars(palette: Palette, fonts: Fonts): Record<string, string> {
  return {
    '--inv-bg': palette.bg,
    '--inv-surface': palette.surface,
    '--inv-ink': palette.ink,
    '--inv-muted': palette.muted,
    '--inv-accent': palette.accent,
    '--inv-accent2': palette.accent2,
    '--inv-display': fonts.display,
    '--inv-body': fonts.body,
    '--inv-names': fonts.names || fonts.display,
    '--inv-script': fonts.script || fonts.display,
    '--inv-script-style': fonts.scriptStyle || 'normal',
  };
}

/** The Google Fonts stylesheet URL for a font set. */
export function googleFontsUrl(fonts: Fonts): string {
  const families = fonts.load
    .map((f) => {
      const [family, axes] = f.split(':');
      return `family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axes || 'wght@400;500;600;700'}`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * The set in the list a stored pair of faces is, if it is one of them.
 *
 * Compared face by face rather than as JSON, so a set saved before a field
 * was added to the type is still recognised as itself: what makes two sets
 * the same is that they draw the same letters.
 */
export function fontSetKey(fonts: Fonts): string {
  const same = (a: Fonts, b: Fonts) =>
    a.display === b.display && a.body === b.body && (a.names ?? '') === (b.names ?? '') && (a.script ?? '') === (b.script ?? '');
  return FONT_PRESETS.find((f) => same(f.fonts, fonts))?.key ?? '';
}

/**
 * The stylesheet that draws a menu of font sets in the faces it offers.
 *
 * One request for all of them, because forty sets would otherwise be forty
 * requests. A family named twice keeps the fuller of the two axis specs, and
 * a family named with no spec at all is asked for the one weight every
 * family has — a menu needs the shape of the letters, not the weights, and a
 * single weight asked of a family that has it can never fail the whole
 * request and leave every face in the menu drawn in the fallback.
 */
export function allFacesUrl(): string {
  const best = new Map<string, string>();
  for (const set of FONT_PRESETS) {
    for (const entry of set.fonts.load) {
      const family = entry.split(':')[0];
      const had = best.get(family);
      if (!had || entry.length > had.length) best.set(family, entry);
    }
  }
  const load = [...best.values()].map((e) => (e.includes(':') ? e : `${e}:wght@400`));
  return googleFontsUrl({ ...FONT_PRESETS[0].fonts, load });
}
