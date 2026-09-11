import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { isPaged } from '@/lib/sections';
import { paletteFrom, fontsFrom, cssVars } from '@/lib/theme';
import { LOOK_BY_KEY, isLook } from '@/lib/looks';
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
  const look = withWords(t.look && isLook(t.look) ? LOOK_BY_KEY[t.look] : undefined, wordsOf(t.words));
  const vars = cssVars(paletteFrom(t.palette), fontsFrom(t.fonts));

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
