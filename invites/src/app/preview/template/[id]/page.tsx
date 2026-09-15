import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Occasion } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireStaffPage } from '@/lib/guard';
import { loadPublic, contentOf } from '@/lib/invitations';
import { getSettings } from '@/lib/settings';
import { fontBook } from '@/lib/font-book';
import { findSet } from '@/lib/fonts';
import { isLayout, paletteFrom, fontsFrom } from '@/lib/theme';
import { isOccasion } from '@/lib/occasions';
import { previewSitter } from '@/lib/sitter';
import { paletteFromForm, fontsFromForm, sitterContent } from '@/lib/preview';
import { Invitation } from '@/components/invite/renderer';
import { documentOf } from '@/lib/design';
import { sampleContent, isSample } from '@/lib/samples';
import { screenPx } from '@/app/[slug]/shared';

export const metadata: Metadata = { title: 'Preview', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * The design as the template form stands, drawn on a real invitation.
 *
 * The form is a sheet of knobs — six colours, a pairing, a set, a layout —
 * and until this page existed the only way to see what any of them did was
 * to press Save and go looking for the result. So the panel beside the form
 * points an iframe here and re-points it as she types. Nothing is written:
 * the row is read, the query is laid over it, and the page is thrown away
 * when the next letter arrives.
 *
 * What follows the form: the six colours, the pairing, the font set, the
 * layout, and day or night. What comes off the saved row: the design's own
 * words and pictures. Those are paragraphs and file URLs — too long for a
 * query string, and changed rarely enough that saving first is no hardship.
 *
 * Staff only, and never indexed: an unpublished design is not something to
 * hand out through a link.
 */
type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TemplatePreviewPage({ params, searchParams }: Params) {
  await requireStaffPage('templates.view');
  const { id } = await params;
  const q = await searchParams;
  const get = (key: string) => {
    const v = q[key];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  };

  /*
   * `new` is a design that does not exist yet, and it is the case the panel
   * is needed for most: the whole point is to see the colours before there
   * is a row to look at. So the row is optional, and what it would have
   * supplied — the words, the pictures, the demo — is simply absent.
   */
  const row = id === 'new' ? null : await prisma.template.findUnique({ where: { id } });
  if (id !== 'new' && !row) notFound();
  const occasion = (isOccasion(get('occasion')) ? get('occasion') : (row?.occasion ?? 'WEDDING')) as Occasion;
  const seat = await previewSitter(row?.demoSlug ?? '', occasion);
  const inv = seat && (await loadPublic(seat.slug, { preview: true }));
  if (!inv) notFound();

  const sets = await fontBook();
  const s = await getSettings();
  const mode = get('mode') === 'night' ? 'night' : 'day';
  const layout = isLayout(get('layout')) ? get('layout') : row && isLayout(row.layout) ? row.layout : 'classic';

  /*
   * The design over the sitter, in both directions. The template's columns
   * are replaced by what the form says; the sitter's *content* loses the
   * theme it may be carrying, because `resolveTheme` lets a customer's own
   * colours win over the design's — right on a guest's page, and exactly
   * wrong here, where it would answer every colour she typed with somebody
   * else's. See lib/preview.ts.
   *
   * The tier stays the sitter's. It is the sitter's package that decides
   * whether a pairing is allowed, and a set above it is drawn in the base
   * set — which is what that customer would really see. The panel names who
   * is sitting, so "why is this Modern?" has its answer on the screen.
   */
  /*
   * The pages as the studio is drawing them. The form's panel asks for the
   * draft, because what she is making is what she wants to see beside the
   * knobs; a guest still gets what was published, from the row.
   */
  const draft = get('design') === 'draft' && row?.designDraft && typeof row.designDraft === 'object' && Object.keys(row.designDraft as object).length ? row.designDraft : undefined;
  /*
   * The studio's canvas, for a design with no demo of its own: one page at a
   * time, against the sitter or a made-up sample, at a screen's height. The
   * same three the guest page takes for a design that has a demo; this
   * route is what the studio falls back to, so a design made a minute ago
   * is drawn on somebody rather than on nothing.
   */
  const only = get('page') || undefined;
  const words = contentOf(inv.content) as Record<string, unknown>;
  const sampled = isSample(get('sample')) && get('sample') !== 'demo'
    ? sampleContent(get('sample') as never, { doc: documentOf({ design: draft ?? row?.design, layout }), occasion, demo: words })
    : words;
  const shown = {
    ...inv,
    content: sitterContent(sampled as { theme?: unknown }, mode) as never,
    template: {
      ...(row ?? inv.template),
      ...(draft ? { design: draft } : {}),
      layout,
      look: findSet(get('look'), sets)?.key ?? '',
      palette: (get('bg') || get('paletteFamily') || get('paletteKey')
        ? paletteFromForm(get)
        : paletteFrom(row?.palette ?? inv.template.palette)) as never,
      fonts: (get('fontsKey') ? fontsFromForm(get) : fontsFrom(row?.fonts ?? inv.template.fonts)) as never,
    },
  };

  return <Invitation invitation={shown} bare shape="phone" only={only} screen={screenPx(get('screen'))} sets={sets} businessName={s['business.name']} />;
}
