/**
 * A template's look is a palette and a pair of fonts, applied as CSS variables
 * on the invitation root. The renderer never hard-codes a colour, so a
 * customer on the Standard tier can pick another preset and a Complete
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
  /** Google Fonts family names to load, e.g. ["Cormorant Garamond", "Jost"]. */
  load: string[];
};

export const PALETTE_PRESETS: { key: string; label: string; palette: Palette; muted?: boolean }[] = [
  { key: 'ivory', label: 'Ivory & Sage', palette: { bg: '#faf7f2', surface: '#ffffff', ink: '#2b2b28', muted: '#6b6a61', accent: '#5b6b4e', accent2: '#c9b48a' } },
  { key: 'blush', label: 'Blush & Gold', palette: { bg: '#fbf4f2', surface: '#ffffff', ink: '#3a2e2e', muted: '#7a6a6a', accent: '#a6555e', accent2: '#d3b06c' } },
  { key: 'navy', label: 'Navy & Champagne', palette: { bg: '#f6f4ef', surface: '#ffffff', ink: '#1f2a3d', muted: '#5d6675', accent: '#1f2a3d', accent2: '#c8ad7f' } },
  { key: 'terracotta', label: 'Terracotta & Cream', palette: { bg: '#fbf6ef', surface: '#ffffff', ink: '#3b2a22', muted: '#7d6a5f', accent: '#b8603d', accent2: '#e0b98a' } },
  { key: 'emerald', label: 'Emerald & Ivory', palette: { bg: '#f5f8f5', surface: '#ffffff', ink: '#1f2d27', muted: '#5e6d66', accent: '#1e5c47', accent2: '#b9a26b' } },
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
  { key: 'editorial', label: 'Editorial', fonts: { display: "'Playfair Display', Georgia, serif", body: "'DM Sans', system-ui, sans-serif", load: ['Playfair Display', 'DM Sans'] } },
  { key: 'script', label: 'Script', fonts: { display: "'Great Vibes', 'Brush Script MT', cursive", body: "'Lora', Georgia, serif", load: ['Great Vibes', 'Lora'] } },
  { key: 'modern', label: 'Modern sans', fonts: { display: "'Montserrat', 'Segoe UI', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif", load: ['Montserrat', 'Inter'] } },
  { key: 'playful', label: 'Playful', fonts: { display: "'Fredoka', 'Segoe UI', system-ui, sans-serif", body: "'Nunito', system-ui, sans-serif", load: ['Fredoka', 'Nunito'] } },
];

export const LAYOUTS = ['classic', 'editorial', 'garden', 'modern', 'festive', 'quiet'] as const;
export type Layout = (typeof LAYOUTS)[number];

export function isLayout(v: string): v is Layout {
  return (LAYOUTS as readonly string[]).includes(v);
}

export function paletteFrom(raw: unknown): Palette {
  const base = PALETTE_PRESETS[0].palette;
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
  return {
    display: typeof o.display === 'string' && o.display ? o.display : base.display,
    body: typeof o.body === 'string' && o.body ? o.body : base.body,
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
  };
}

/** The Google Fonts stylesheet URL for a font set. */
export function googleFontsUrl(fonts: Fonts): string {
  const families = fonts.load.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
