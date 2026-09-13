import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { contentOf, resolveTheme } from '@/lib/invitations';
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
 * Every design opens here, whatever its layout. One with a document of its
 * own opens on that; a copy of Baby Blue opens on its layout's built-in; and
 * a design on one of the six flat layouts — which have no built-in — opens on
 * a starter, one page per section its occasion offers. Until this the studio
 * refused those outright, so a design made from the Templates list led to a
 * form and stopped there, which is not what a studio is for.
 */
export default async function DesignStudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ against?: string }> }) {
  const user = await requireStaffPage('templates.edit');
  const { id } = await params;
  const { against: againstId } = await searchParams;
  const t = await prisma.template.findUnique({ where: { id } });
  if (!t) notFound();
  const doc = studioDoc(t);
  if (!doc) notFound();

  // The demo invitation is what the pages are drawn against: without one the
  // canvas is a set of empty frames and there is nothing to judge. Its id
  // and title are for the form the studio carries, which edits the demo the
  // way the Invitation tab would.
  const demo = t.demoSlug ? await prisma.invitation.findUnique({ where: { slug: t.demoSlug }, select: { id: true, title: true, content: true, slug: true } }) : null;
  /*
   * The invitation she came from. The Invitation tab's "Design studio"
   * button opens the studio against that very invitation, form and canvas
   * both, so she is not choosing it from the menu a second time. Scoped to
   * this design exactly as invitationContentAction is — a studio only ever
   * opens the invitations on its own design — and behind the same
   * permission, since a customer's answers are an invitations matter and
   * not a design one. Absent, or not found, and the studio opens on the
   * demo as it always has.
   */
  const against = againstId && can(user.role, 'invitations.view')
    ? await prisma.invitation.findFirst({ where: { id: againstId, templateId: t.id }, select: { id: true, slug: true, title: true, content: true, tier: true, status: true } })
    : null;
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
        demoId={demo?.id ?? ''}
        demoTitle={demo?.title ?? ''}
        content={demo ? (contentOf(demo.content) as Record<string, unknown>) : {}}
        against={against ? { id: against.id, slug: against.slug, title: against.title, content: contentOf(against.content) as Record<string, unknown>, tier: against.tier, status: against.status } : null}
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
