import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { DFY_COLUMNS } from '@/lib/dfy';
import { sectionsFor, sectionLabel, fieldsFor, type Content, type Field } from '@/lib/sections';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, DfyPill, BackLink } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { dfyAssignAction, dfyMoveAction, dfyReplyAction, dfyNotesAction, dfyExtendAction } from '../../actions';

export const dynamic = 'force-dynamic';

function renderValue(field: Field, v: unknown): string {
  if (v == null || v === '') return '';
  if (field.type === 'toggle') return v ? 'Yes' : 'No';
  if (field.type === 'person') { const p = v as { title: string; name: string; deceased: boolean }; return p.name ? `${p.title} ${p.name}${p.deceased ? ' †' : ''}`.trim() : ''; }
  if (field.type === 'colors') return (v as string[]).join(', ');
  if (field.type === 'list') return (v as Record<string, unknown>[]).map((row) => (field.item ?? []).map((f) => renderValue(f, row[f.key])).filter(Boolean).join(' · ')).join('\n');
  return String(v);
}

export default async function DfyJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<FlashParams> }) {
  const user = await requireStaffPage('dfy.view');
  const { id } = await params;
  const sp = await searchParams;
  const job = await prisma.dfyJob.findUnique({
    where: { id },
    include: { order: { include: { user: true, package: true } }, invitation: true, assignee: { select: { id: true, name: true } }, revisions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!job) notFound();
  const staff = await prisma.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'ENCODER'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const back = `/admin/dfy/${job.id}`;
  const intake = (job.intake ?? {}) as { content?: Content; notes?: string; method?: string };
  const occasion = job.invitation.occasion;
  const canEdit = can(user.role, 'dfy.edit');

  return (
    <>
      <BackLink href="/admin/dfy">DFY queue</BackLink>
      <PageHeader title={job.invitation.title} subtitle={<><DfyPill status={job.status} /> · {job.order.reference} · {job.order.package.name} · {job.order.serviceMode} · {job.order.user.name} ({job.order.user.email}{job.order.user.phone && `, ${job.order.user.phone}`})</>}
        actions={<><Link href={`/account/invitations/${job.invitationId}/builder`} className="btn btn-primary btn-sm">Open builder</Link><a href={`/i/${job.invitation.slug}?preview=1`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Preview</a></>} />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Customer intake {intake.method && <span className="pill pill-muted ml-1">via {intake.method.toLowerCase()}</span>}{job.intakeSubmittedAt && <span className="ml-2 text-xs font-normal text-[color:var(--color-ink-500)]">submitted {formatDateTime(job.intakeSubmittedAt)}</span>}</h2>
            {!job.intakeSubmittedAt && <p className="text-sm text-[color:var(--color-ink-500)]">Not submitted yet. If the customer sent details by chat, encode them straight into the builder.</p>}
            {intake.notes && <p className="mb-3 whitespace-pre-line rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">{intake.notes}</p>}
            {intake.content && (
              <div className="space-y-3">
                {sectionsFor(occasion).map((def) => {
                  const data = intake.content?.[def.key];
                  if (!data) return null;
                  const fields = fieldsFor(def.key, occasion);
                  const rows = fields.map((f) => [f.label, renderValue(f, data[f.key])] as const).filter(([, v]) => v);
                  if (!rows.length) return null;
                  return (
                    <details key={def.key} open className="rounded-lg border border-[color:var(--color-sand-200)] p-3 text-sm">
                      <summary className="cursor-pointer font-semibold">{sectionLabel(def.key, occasion)}</summary>
                      <dl className="mt-2 grid gap-1 sm:grid-cols-[12rem_1fr]">
                        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-xs text-[color:var(--color-ink-500)]">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>)}
                      </dl>
                    </details>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Conversation with the customer</h2>
            <ul className="space-y-2">
              {job.revisions.map((r) => (
                <li key={r.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${r.byStaff ? 'ml-auto bg-[#e3edf7]' : 'bg-[color:var(--color-sand-100)]'}`}><p className="whitespace-pre-line">{r.body}</p><p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{r.authorName} · round {r.round} · {formatDateTime(r.createdAt)}</p></li>
              ))}
              {job.revisions.length === 0 && <li className="text-sm text-[color:var(--color-ink-500)]">No messages yet.</li>}
            </ul>
            {canEdit && <form action={dfyReplyAction.bind(null, job.id, back)} className="mt-3 flex gap-2"><input name="body" className="field" placeholder="Reply to the customer (they get a notification and can read it on their dashboard)" required /><button className="btn btn-secondary" type="submit">Send</button></form>}
          </section>
        </div>

        <aside className="space-y-3">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Status</h2>
            {canEdit ? (
              <form action={dfyMoveAction.bind(null, job.id, back)} className="flex gap-1">
                <select name="status" defaultValue={job.status} className="field">{DFY_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                <button className="btn btn-primary btn-sm" type="submit">Move</button>
              </form>
            ) : <DfyPill status={job.status} />}
            <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">Moving to “Preview sent” emails the customer their preview link. Moving to “Published” publishes the invitation.</p>
            <p className="mt-2 text-xs">Revisions used: {job.revisionsUsed} / {job.revisionsAllowed}</p>
            <p className="text-xs">Due: {job.dueAt ? formatDateTime(job.dueAt) : '—'}{job.dueAt && job.dueAt < new Date() && !['PREVIEW_SENT', 'APPROVED', 'PUBLISHED'].includes(job.status) && <span className="pill pill-bad ml-1">Overdue</span>}</p>
            {canEdit && <form action={dfyExtendAction.bind(null, job.id, back)} className="mt-1 flex gap-1"><input name="days" type="number" defaultValue={1} className="field max-w-[5rem]" /><button className="btn btn-secondary btn-sm" type="submit">+ days</button></form>}
          </section>
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Encoder</h2>
            {can(user.role, 'dfy.assign') ? (
              <form action={dfyAssignAction.bind(null, job.id, back)} className="flex gap-1">
                <select name="assigneeId" defaultValue={job.assigneeId ?? ''} className="field"><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <button className="btn btn-secondary btn-sm" type="submit">Assign</button>
              </form>
            ) : <p>{job.assignee?.name ?? 'Unassigned'}</p>}
          </section>
          {canEdit && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Internal notes</h2>
              <form action={dfyNotesAction.bind(null, job.id, back)}><textarea name="notes" defaultValue={job.internalNotes} rows={5} className="field" /><button className="btn btn-secondary btn-sm mt-2" type="submit">Save notes</button></form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
