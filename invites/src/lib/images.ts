/**
 * Photos are served through Supabase's image transformation endpoint rather
 * than as the file the phone uploaded.
 *
 * A modern phone photo is three or four megabytes and four thousand pixels
 * wide. The guest page shows it in a grid cell a couple of hundred pixels
 * across, and a wedding album can hold five hundred of them. Served raw, one
 * album viewed by two hundred guests is hundreds of gigabytes of egress —
 * enough on its own to exhaust a month's allowance for every app on the
 * project. Resized, the same album is a rounding error.
 *
 * Two things make this cheap. Transformations are billed per *origin* image,
 * not per transformation, so asking for several sizes of one photo costs the
 * same as asking for one — the sizes below are chosen for how each place
 * actually renders, not rationed. And the endpoint negotiates WebP by itself,
 * so the bytes drop again without anything here mentioning a format.
 *
 * Anything that is not a Supabase public object — a local `public/uploads`
 * path in development, a data URL, a photo somebody pasted from elsewhere —
 * is handed back untouched.
 */

/** Supabase's documented bounds for the transformation endpoint. */
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 2500;

const PUBLIC_OBJECT = '/storage/v1/object/public/';
const RENDER_IMAGE = '/storage/v1/render/image/public/';

export type ImageOptions = {
  /** Rendered width in CSS pixels; ask for roughly twice it, for dense screens. */
  width: number;
  height?: number;
  /** 20–100. Supabase defaults to 80; 75 is indistinguishable in a grid. */
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

function clamp(n: number): number {
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.round(n)));
}

/**
 * Image transformation is a paid Supabase feature and can be switched off in
 * the dashboard. `SUPABASE_IMAGE_TRANSFORM=off` matches that from this side,
 * so a project that loses the feature serves originals rather than broken
 * images.
 */
function enabled(): boolean {
  return (process.env.SUPABASE_IMAGE_TRANSFORM ?? '').toLowerCase() !== 'off';
}

/*
 * Call this from server components only. The kill switch above reads a plain
 * server variable, which is `undefined` inside a client bundle — a client
 * component would keep rewriting URLs after the switch was thrown, and the
 * broken images it was thrown to fix would stay broken. The two client
 * components that show a photo are the builder's field preview and the
 * template picker: both are behind a login, both render one small image, and
 * neither is worth a NEXT_PUBLIC_ variable to cover.
 */

export function imageUrl(raw: string | null | undefined, opts: ImageOptions): string {
  const src = (raw ?? '').trim();
  if (!src || !enabled()) return src;
  if (!src.includes(PUBLIC_OBJECT)) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }

  url.pathname = url.pathname.replace(PUBLIC_OBJECT, RENDER_IMAGE);
  url.searchParams.set('width', String(clamp(opts.width)));
  if (opts.height) url.searchParams.set('height', String(clamp(opts.height)));
  url.searchParams.set('quality', String(Math.max(20, Math.min(100, opts.quality ?? 75))));
  if (opts.resize) url.searchParams.set('resize', opts.resize);
  return url.toString();
}

/**
 * The sizes each place actually needs, named so a change is made once and the
 * reason is visible. Doubled for dense screens where the element is small.
 */
export const IMAGE = {
  /** Full-bleed hero behind the names. */
  hero: { width: 1400, quality: 70 } as const,
  /** Two-column grid on a phone: gallery photos and the guest album. */
  grid: { width: 800 } as const,
  /** Single photo inside a section — closing, sections with their own image. */
  feature: { width: 1000 } as const,
  /** Story timeline entries, narrower than full width. */
  story: { width: 700 } as const,
  /** 80px avatars in the entourage. */
  avatar: { width: 200, height: 200, resize: 'cover' } as const,
  /** Moderation thumbnails in the dashboard. */
  thumb: { width: 400 } as const,
  /** The cover photo drawn into the 1080×1350 share card, at 400px. */
  card: { width: 800 } as const,
} satisfies Record<string, ImageOptions>;
