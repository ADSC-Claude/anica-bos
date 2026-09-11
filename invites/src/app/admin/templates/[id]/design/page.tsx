import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { contentOf, resolveTheme } from '@/lib/invitations';
import { isPaged } from '@/lib/sections';
import { cssVars } from '@/lib/theme';
import { studioDoc, documentOf, wordsOf, withWords } from '@/lib/design';
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
  const theme = resolveTheme(t, demo ? contentOf(demo.content) : {});
  const look = withWords(theme.look, wordsOf(t.words));
  const vars = cssVars(theme.palette, theme.fonts);

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
        canPublish={can(user.role, 'templates.publish')}
      />
    </>
  );
}
