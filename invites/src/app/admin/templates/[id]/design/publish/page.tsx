import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { isPaged, SECTION_BY_KEY, type SectionKey } from '@/lib/sections';
import { documentOf, builtinDesign, blastRadius } from '@/lib/design';
import { PageHeader, BackLink, Notice } from '@/components/ui';
import { Flash, type FlashParams } from '../../../../flash';
import { publishDesignAction, discardDesignDraftAction, restoreDesignAction } from '../../../../actions';

export const dynamic = 'force-dynamic';

const name = (key: string) => SECTION_BY_KEY[key as SectionKey]?.label ?? key;

/**
 * What Publish will do, before she does it.
 *
 * Publishing a design redraws every invitation already built on it, live ones
 * included. The numbers here are the true ones, read off the invitations
 * themselves: how many are on this design, and for every list whose frame
 * count changes, how many of them hold answers on the wrong side of the
 * change. Nothing is ever deleted — a frame that goes simply stops being
 * drawn, and the words behind it wait.
 */
export default async function PublishDesignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  await requireStaffPage('templates.publish');
  const { id } = await params;
  const sp = await searchParams;
  const t = await prisma.template.findUnique({ where: { id } });
  if (!t || !isPaged(t.layout)) notFound();
  const draft = documentOf({ design: t.designDraft, layout: t.layout });
  const before = documentOf(t) ?? builtinDesign(t.layout);
  const invitations = await prisma.invitation.findMany({ where: { templateId: id }, select: { status: true, content: true } });
  const r = draft ? blastRadius(before, draft, invitations) : null;
  const back = `/admin/templates/${id}/design/publish`;
  const published = Boolean(documentOf(t));

  return (
    <>
      <BackLink href={`/admin/templates/${id}/design`}>Back to the studio</BackLink>
      <PageHeader title={`Publish ${t.name}`} subtitle="What this changes for the invitations already built on this design." />
      <Flash {...sp} />

      {!r ? (
        <Notice>There is no draft to publish. Draw something in the studio first.</Notice>
      ) : (
        <div className="card space-y-4 p-4">
          <p className="text-lg">
            <strong>{r.live}</strong> live {r.live === 1 ? 'invitation' : 'invitations'} and <strong>{r.drafts}</strong> {r.drafts === 1 ? 'draft' : 'drafts'} use this design.
          </p>

          {r.frames.length === 0 && r.pagesAdded.length === 0 && r.pagesRemoved.length === 0 && r.sectionsRemoved.length === 0 && (
            <p>Nothing about what the design asks for changes: the same pages, the same sections and the same number of frames. Only the drawing moves.</p>
          )}

          <ul className="space-y-2">
            {r.frames.map((f) => (
              <li key={`${f.section}.${f.field}`} className="rounded bg-[color:var(--color-sand-100)] p-3">
                <strong>{name(f.section)}</strong> goes from {f.from} {f.from === 1 ? 'frame' : 'frames'} to {f.to}.{' '}
                {f.to > f.from
                  ? `${f.beyond} ${f.beyond === 1 ? 'invitation has' : 'invitations have'} an answer waiting that will now appear.`
                  : `${f.beyond} ${f.beyond === 1 ? 'invitation has' : 'invitations have'} answers past the ${f.to}${f.to === 1 ? 'st' : 'th'} that will stop showing. Their words are kept, not deleted.`}
              </li>
            ))}
            {r.pagesRemoved.map((k) => <li key={`-${k}`} className="rounded bg-[color:var(--color-sand-100)] p-3">The page <strong>{k}</strong> goes.</li>)}
            {r.pagesAdded.map((k) => <li key={`+${k}`} className="rounded bg-[color:var(--color-sand-100)] p-3">A new page, <strong>{k}</strong>.</li>)}
            {r.sectionsRemoved.map((k) => (
              <li key={`s-${k}`} className="rounded bg-amber-50 p-3">
                <strong>{name(k)}</strong> is no longer carried by any page: what customers wrote there stops appearing. Their answers are kept.
              </li>
            ))}
            {r.sectionsAdded.map((k) => <li key={`sa-${k}`} className="rounded bg-[color:var(--color-sand-100)] p-3"><strong>{name(k)}</strong> is now carried, so what customers already wrote there starts appearing.</li>)}
          </ul>

          <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-sand-300)] pt-4">
            <form action={publishDesignAction.bind(null, id, back)}>
              <button className="btn btn-primary" type="submit">Publish it</button>
            </form>
            <form action={discardDesignDraftAction.bind(null, id, back)}>
              <button className="btn btn-ghost" type="submit">Discard the draft</button>
            </form>
            {published && (
              <form action={restoreDesignAction.bind(null, id, back)}>
                <button className="btn btn-ghost" type="submit">Restore the previous version</button>
              </form>
            )}
            <Link href={`/admin/templates/${id}/design`} className="btn btn-ghost">Keep drawing</Link>
          </div>
          <p className="hint">Restore brings back the version published just before this one, as a draft. It is one step back only: publishing twice loses the older one.</p>
        </div>
      )}
    </>
  );
}
