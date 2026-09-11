import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { sectionsFor, sectionLabel, sectionOrder, sectionUnlocked, sectionFilled, fieldsFor, emptySection, photoFrames, photoFramesHint, type Content, type SectionKey } from '@/lib/sections';
import { sectionAnchor } from '@/lib/anchors';
import { documentOf } from '@/lib/design';
import { designForm, askedFields, askedLimits, asksOf, designMedia } from '@/lib/asks';
import { AsksSheet } from '@/components/asks-sheet';
import { intakeRows, intakeFilled } from '@/lib/intake';
import { doneSections } from '@/lib/progress';
import { galleryLimit } from '@/lib/tiers';
import { formatDateTime } from '@/lib/datetime';
import { DfyPill } from '@/components/ui';
import { Flash, type FlashParams } from '../../../flash';
import { dfyMoveAction } from '../../../actions';
import { Workspace } from './workspace';

export const dynamic = 'force-dynamic';

/**
 * The encoder's workspace: one Done-For-You job, segment by segment, with the
 * client's own answers beside the form and the page scrolled to the segment
 * in hand. Reached from the job page and the order.
 */
export default async function EncodePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams & { section?: string }> }) {
  await requireStaffPage('dfy.edit');
  const { id } = await params;
  const sp = await searchParams;
  const job = await prisma.dfyJob.findUnique({
    where: { id },
    include: { order: { include: { user: true, package: true } }, invitation: { include: { template: true } }, assignee: { select: { name: true } } },
  });
  if (!job) notFound();
  const inv = job.invitation;
  const occasion = inv.occasion;
  const content = contentOf(inv.content);
  const intake = (job.intake ?? {}) as { content?: Content; notes?: string; method?: string };

  // The segments in the order the page shows them, the ones this package has.
  const offered = new Set(sectionsFor(occasion).map((d) => d.key));
  // a design drawn in the studio says which page each section lands on
  const doc = documentOf(inv.template);
  const keys = sectionOrder(occasion, inv.template.layout).filter((k) => offered.has(k) && sectionUnlocked(k, occasion, inv.tier, inv.addOns));
  const sections = keys.map((key) => ({
    key,
    label: sectionLabel(key, occasion),
    description: sectionsFor(occasion).find((d) => d.key === key)?.description ?? '',
    anchor: sectionAnchor(key, inv.template.layout, doc),
    filled: sectionFilled(key, occasion, content[key]),
    fromClient: intakeFilled(fieldsFor(key, occasion), intake.content?.[key]),
  }));
  const current = (sections.find((s) => s.key === sp.section)?.key ?? sections[0]?.key) as SectionKey;
  // staff see every field, the fixed writings included — fitted to the design
  // the same way the customer's form is, so an encoder is told the same room
  const form = designForm(doc, occasion);
  const fields = askedFields(designMedia(fieldsFor(current, occasion, inv.tier), current, form), current, form);
  const initial = { ...emptySection(fields), ...(content[current] ?? {}) };
  const intakeData = intake.content?.[current] ?? null;
  const limit = galleryLimit(inv.tier);
  const back = `/admin/dfy/${job.id}/encode?section=${current}`;
  const starting = job.status === 'NEW' || job.status === 'INTAKE_RECEIVED';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/dfy/${job.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {job.order.reference} · job</Link>
          <h1 className="display text-2xl">{inv.title} <DfyPill status={job.status} /></h1>
          <p className="text-sm text-[color:var(--color-ink-500)]">
            {job.order.package.name} · {inv.template.name} · {job.order.user.name}
            {intake.method && ` · details via ${intake.method.toLowerCase()}`}{job.intakeSubmittedAt && `, submitted ${formatDateTime(job.intakeSubmittedAt)}`}
            {job.assignee && ` · encoder ${job.assignee.name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {starting && (
            <form action={dfyMoveAction.bind(null, job.id, back)}><input type="hidden" name="status" value="ENCODING" /><button className="btn btn-secondary btn-sm" type="submit">Mark as encoding</button></form>
          )}
          {(job.status === 'ENCODING' || job.status === 'REVISION') && (
            <form action={dfyMoveAction.bind(null, job.id, back)}><input type="hidden" name="status" value="PREVIEW_SENT" /><button className="btn btn-primary btn-sm" type="submit">Send the preview to the client</button></form>
          )}
          <Link href={`/account/invitations/${inv.id}/settings`} className="btn btn-secondary btn-sm">Design, look &amp; opening</Link>
        </div>
      </div>
      <Flash {...sp} />
      {!job.intakeSubmittedAt && <p className="mb-4 rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">The client has not submitted their form yet. Anything they sent by chat goes straight into the segments here.</p>}
      <div className="mb-4">
        <AsksSheet
          asks={asksOf(doc, occasion)}
          title="What this design asks the customer for"
          intro="Drawn into the design, so these are the ones with a place waiting on the page."
        />
      </div>
      <Workspace
        key={current}
        jobId={job.id}
        invitationId={inv.id}
        slug={inv.slug}
        sections={sections}
        current={current}
        fields={fields}
        initial={initial}
        intakeRows={intakeRows(fields, intakeData ?? undefined)}
        intakeData={intakeData}
        intakeNotes={intake.notes ?? ''}
        lang={inv.language === 'tl' ? 'tl' : 'en'}
        listLimits={{ photos: Math.min(limit === Infinity ? 200 : limit, photoFrames(inv.template.layout)), ...askedLimits(current, form) }}
        listHints={photoFramesHint(inv.template.layout)}
        done={doneSections(content.progress)}
      />
    </>
  );
}
