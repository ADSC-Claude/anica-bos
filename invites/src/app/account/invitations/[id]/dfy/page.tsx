import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { loadJobForCustomer, DFY_COLUMNS } from '@/lib/dfy';
import { getSettings } from '@/lib/settings';
import { contentOf } from '@/lib/invitations';
import { sectionsFor, sectionLabel, sectionUnlocked, sectionMinTier, fieldsFor, emptySection, type Content } from '@/lib/sections';
import { formatDateTime, formatDate } from '@/lib/datetime';
import { PageHeader, DfyPill, ContactButtons, Notice } from '@/components/ui';
import { IntakeForm, RevisionThread } from './forms';
import { invitationPath } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export default async function DfyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (inv.order && inv.order.status === 'PENDING_PAYMENT') redirect(`/checkout/pay/${inv.order.reference}`);
  const job = await loadJobForCustomer(user, inv.id);
  if (!job) redirect(`/account/invitations/${inv.id}`);
  const s = await getSettings();

  const intake = (job.intake ?? {}) as { content?: Content; notes?: string; method?: string };
  const existing = contentOf(inv.content);
  // Every section the occasion has, including the ones this package does not
  // include. Those come through locked rather than missing, the way the
  // builder's sidebar shows them: a customer who cannot see that a guest photo
  // album exists cannot ask for one, and Done-For-You is where they would ask.
  const sections = sectionsFor(inv.occasion).map((d) => {
    const fields = fieldsFor(d.key, inv.occasion);
    const unlocked = sectionUnlocked(d.key, inv.occasion, inv.tier);
    return {
      key: d.key,
      label: sectionLabel(d.key, inv.occasion),
      description: d.description,
      fields,
      unlocked,
      minTier: sectionMinTier(d.key, inv.occasion),
      initial: { ...emptySection(fields), ...(existing[d.key] ?? {}), ...(intake.content?.[d.key] ?? {}) },
    };
  });

  const stage = DFY_COLUMNS.findIndex((c) => c.key === job.status);
  const canEditIntake = ['NEW', 'INTAKE_RECEIVED', 'ENCODING', 'REVISION', 'PREVIEW_SENT'].includes(job.status);
  const left = job.revisionsAllowed - job.revisionsUsed;

  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title={inv.order?.serviceMode === 'CONCIERGE' ? 'Full Concierge' : 'Done-For-You'} subtitle={<><DfyPill status={job.status} />{job.assignee ? ` · your encoder: ${job.assignee.name}` : ''}{job.dueAt && stage < 3 ? ` · preview due ${formatDate(job.dueAt)}` : ''}</>} />

      <ol className="mb-6 flex flex-wrap gap-1 text-xs">
        {DFY_COLUMNS.map((c, i) => (
          <li key={c.key} className={`rounded-full px-3 py-1 ${i < stage ? 'bg-[#e3f3e8] text-[#1e5c37]' : i === stage ? 'bg-[color:var(--color-plum-600)] text-white' : 'bg-[color:var(--color-sand-100)] text-[color:var(--color-ink-500)]'}`}>{c.label}</li>
        ))}
      </ol>

      {job.status === 'NEW' && <div className="mb-4"><Notice tone="info">Paid and ready. Tell us the details below — or pick “I’ll send it over Messenger / Viber” and just submit. We start within a working day.</Notice></div>}
      {job.status === 'PREVIEW_SENT' && <div className="mb-4"><Notice tone="warn">Your preview is ready. <a href={`${invitationPath(inv.slug)}?preview=1`} target="_blank" rel="noopener" className="underline">Open it on your phone</a>, then approve it below or tell us what to change. {left} revision round{left === 1 ? '' : 's'} left.</Notice></div>}
      {job.status === 'APPROVED' && <div className="mb-4"><Notice tone="ok">Approved — we are publishing it now. You will get the link on your dashboard and by email.</Notice></div>}
      {job.status === 'PUBLISHED' && <div className="mb-4"><Notice tone="ok">Live! Your invitation is at <a href={invitationPath(inv.slug)} className="underline">{invitationPath(inv.slug)}</a>. You can still tweak it yourself in the <Link href={`/account/invitations/${inv.id}/builder`} className="underline">builder</Link>.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {(job.status === 'PREVIEW_SENT' || job.status === 'REVISION' || job.revisions.length > 0) && (
            <div className="card p-4">
              <h2 className="mb-2 font-semibold">Preview & revisions</h2>
              <RevisionThread invitationId={inv.id} status={job.status} previewHref={`${invitationPath(inv.slug)}?preview=1`} revisionsLeft={left} revisions={job.revisions.map((r) => ({ id: r.id, round: r.round, author: r.authorName, byStaff: r.byStaff, body: r.body, at: formatDateTime(r.createdAt) }))} />
            </div>
          )}
          <div className="card p-4">
            <h2 className="font-semibold">Your details</h2>
            <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">{job.intakeSubmittedAt ? `Submitted ${formatDateTime(job.intakeSubmittedAt)}. You can still update and resubmit.` : 'Everything saves as a draft as you go. Submit when you are done — leave blank anything you would rather send by chat.'}</p>
            <IntakeForm invitationId={inv.id} lang={inv.language === 'tl' ? 'tl' : 'en'} sections={sections} method={intake.method ?? job.intakeMethod} notes={intake.notes ?? ''} editable={canEditIntake} messenger={s['contact.messenger']} viber={s['contact.viber']} />
          </div>
        </div>
        <aside className="space-y-3">
          <div className="card p-4 text-sm">
            <p className="font-semibold">Prefer to chat?</p>
            <p className="text-[color:var(--color-ink-700)]">Send photos, your entourage list or an Excel file straight to us. Mention order {inv.order?.reference}.</p>
            <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} className="mt-2" size="sm" />
          </div>
          <div className="card p-4 text-xs text-[color:var(--color-ink-500)]">
            <p>Turnaround: {inv.order?.serviceMode === 'CONCIERGE' ? `${s['concierge.turnaroundDays']} working days` : `${s['dfy.turnaroundDays']} working days`} from the time we receive your details.</p>
            <p className="mt-1">Revisions: {job.revisionsAllowed} rounds included.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
