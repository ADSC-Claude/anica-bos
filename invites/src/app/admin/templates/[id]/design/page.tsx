import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { contentOf, resolveTheme } from '@/lib/invitations';
import { isPaged } from '@/lib/sections';
import { cssVars, paletteFrom, fontsFrom, allFacesUrl } from '@/lib/theme';
import { setForFaces } from '@/lib/fonts';
import { fontBook } from '@/lib/font-book';
import { studioDoc, documentOf, wordsOf, withWords } from '@/lib/design';
import { designFiles } from '@/lib/design-files';
import { signDraftLink } from '@/lib/draft-link';
import { absoluteUrl } from '@/lib/app-url';
import { BackLink } from '@/components/ui';
import { Studio } from './studio';

export const dynamic = 'force-dynamic';

/**
 * The Design Studio: where a design's pages are drawn.
 *
 * Only a design whose layout lays pages can have one — the six flat layouts
 * would render a document as a plain list of sections, which is not a design
 * anybody drew. A design with no document of its own opens on its layout's
 * built-in, which is how a copy of Baby Blue starts life.
 */
export default async function DesignStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage('templates.edit');
  const { id } = await params;
  const t = await prisma.template.findUnique({ where: { id } });
  if (!t || !isPaged(t.layout)) notFound();
  const doc = studioDoc(t);
  if (!doc) notFound();

  // The demo invitation is what the pages are drawn against: without one the
  // canvas is a set of empty frames and there is nothing to judge.
  const demo = t.demoSlug ? await prisma.invitation.findUnique({ where: { slug: t.demoSlug }, select: { content: true, slug: true } }) : null;
  /**
   * The colours and faces a guest actually gets, not the raw columns. A
   * design set in a look is drawn in the look's faces — the `fonts` column
   * underneath is what it would fall back to — so the studio has to resolve
   * it the same way the guest page does or she would be drawing in a face
   * nobody ever sees.
   */
  /*
   * The link to the unfinished design, when she has shared it. It is drawn
   * from the secret on the row rather than remembered from a flash message,
   * so what the top bar shows is always the link that currently works.
   */
  const shareLink = t.shareNonce && t.demoSlug
    ? absoluteUrl(`/${t.demoSlug}?design=draft&key=${await signDraftLink(t.id, t.shareNonce)}`)
    : '';

  const sets = await fontBook();
  const theme = resolveTheme(t, demo ? contentOf(demo.content) : {}, undefined, sets);
  const look = withWords(theme.look, wordsOf(t.words));
  const vars = cssVars(theme.palette, theme.fonts);
  /*
   * What the Theme popover edits is the design's own two columns — not what
   * the canvas happens to be drawn in. The two differ when the demo
   * invitation carries colours of its own or the design is set in a look,
   * and the popover says so rather than letting the canvas jump under her
   * hand with no explanation.
   */
  const own = paletteFrom(t.palette);
  const [live, drafts, files] = await Promise.all([
    prisma.invitation.count({ where: { templateId: t.id, status: 'PUBLISHED' } }),
    prisma.invitation.count({ where: { templateId: t.id, status: { not: 'PUBLISHED' } } }),
    /*
     * What this design's own uploads weigh and how long its clips run. The
     * checklist says so about a background too heavy for a phone and a clip
     * longer than a page holds, and this is where both can be known without
     * fetching anything: the row recorded them when the file arrived. The
     * pictures the app ships with have no row and are not in here.
     */
    designFiles(t.id),
  ]);

  return (
    <>
      <BackLink href={`/admin/templates/${t.id}`}>{t.name}</BackLink>
      <Studio
        templateId={t.id}
        name={t.name}
        layout={t.layout}
        occasion={t.occasion}
        doc={doc}
        rev={t.designDraftRev}
        hasDraft={Boolean(documentOf({ design: t.designDraft, layout: t.layout }))}
        published={Boolean(documentOf(t))}
        demoSlug={demo?.slug ?? ''}
        content={demo ? (contentOf(demo.content) as Record<string, unknown>) : {}}
        look={look}
        vars={vars}
        weights={files.weights}
        lengths={files.lengths}
        shop={{ shown: t.published || t.featured, thumbnail: Boolean(t.thumbnailUrl) }}
        theme={{
          palette: own,
          fontsKey: setForFaces(fontsFrom(t.fonts), sets)?.key ?? '',
          look: theme.look?.name ?? '',
          overridden: JSON.stringify(own) !== JSON.stringify(theme.palette),
          live,
          drafts,
          sets: sets.map((x) => ({ key: x.key, name: x.name, tagline: x.tagline, fonts: x.fonts })),
          facesUrl: allFacesUrl(sets),
        }}
        canPublish={can(user.role, 'templates.publish')}
        shareLink={shareLink}
      />
    </>
  );
}
