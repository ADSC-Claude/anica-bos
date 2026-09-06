import 'server-only';
import type { DfyStatus } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { audit } from './audit';
import { notify, notifyStaff } from './notifications';
import { sendEmail, render, baseVars } from './email';
import { getSettings } from './settings';
import { absoluteUrl, invitationUrl } from './app-url';
import { publish as publishInvitation } from './invitations';
import { cleanSection, fieldsFor, sectionsFor, sectionUnlocked, type Content } from './sections';
import { addDays } from './datetime';
import type { SessionUser } from './auth';

/**
 * Done-For-You. The job moves left to right on the admin kanban:
 *   NEW → INTAKE_RECEIVED → ENCODING → PREVIEW_SENT → (REVISION ⇄ PREVIEW_SENT) → APPROVED → PUBLISHED
 *
 * The customer's intake is stored on the job as-is, and also copied into the
 * invitation's content so the encoder starts from what the customer typed
 * rather than from a blank builder.
 */

export const DFY_COLUMNS: { key: DfyStatus; label: string; hint: string }[] = [
  { key: 'NEW', label: 'New', hint: 'Paid, waiting for details' },
  { key: 'INTAKE_RECEIVED', label: 'Intake received', hint: 'Ready to encode' },
  { key: 'ENCODING', label: 'Encoding', hint: 'Being built' },
  { key: 'PREVIEW_SENT', label: 'Preview sent', hint: 'Waiting on the customer' },
  { key: 'REVISION', label: 'Revision', hint: 'Changes requested' },
  { key: 'APPROVED', label: 'Approved', hint: 'Ready to publish' },
  { key: 'PUBLISHED', label: 'Published', hint: 'Handed over' },
];

const ORDER: DfyStatus[] = DFY_COLUMNS.map((c) => c.key);

export async function loadJobForCustomer(user: SessionUser, invitationId: string) {
  const job = await prisma.dfyJob.findUnique({
    where: { invitationId },
    include: { invitation: true, order: true, assignee: { select: { name: true } }, revisions: { orderBy: { createdAt: 'asc' } } },
  });
  if (!job || job.invitation.userId !== user.id) return null;
  return job;
}

/**
 * The customer's intake: the same section fields as the builder, submitted in
 * one go, plus how they would rather send anything else. Autosaved as a
 * draft until they press Submit.
 */
export async function saveIntake(
  user: SessionUser,
  invitationId: string,
  input: { content: unknown; method: string; notes: string; submit: boolean },
) {
  const job = await loadJobForCustomer(user, invitationId);
  if (!job) throw new HttpError(404, 'No Done-For-You job for that invitation.');
  if (['APPROVED', 'PUBLISHED'].includes(job.status)) throw new HttpError(400, 'This job is already approved.');

  const occasion = job.invitation.occasion;
  const raw = (input.content && typeof input.content === 'object' ? input.content : {}) as Record<string, unknown>;
  const cleaned: Content = {};
  for (const def of sectionsFor(occasion)) {
    if (raw[def.key] === undefined) continue;
    // A section the package does not include is dropped, not stored. The
    // intake form shows those sections now — locked, as an upsell — so a
    // stale or hand-made payload naming one is something to expect rather
    // than a curiosity, and content that was never paid for must not reach
    // the invitation this merges into on submit.
    //
    // Dropped rather than refused, unlike the builder's saveSection, which
    // answers 403: that saves one section at a time, where refusing costs
    // the customer nothing. This saves every section at once, and throwing
    // the whole intake away over one key a client sent before it caught up
    // with a tier change would lose somebody's typing.
    if (!sectionUnlocked(def.key, occasion, job.invitation.tier)) continue;
    cleaned[def.key] = cleanSection(fieldsFor(def.key, occasion), raw[def.key]).data;
  }
  const method = ['FORM', 'MESSENGER', 'EXCEL'].includes(input.method) ? input.method : 'FORM';
  const intake = { content: cleaned, notes: input.notes.trim().slice(0, 4000), method };

  const updated = await prisma.dfyJob.update({
    where: { id: job.id },
    data: {
      intake: intake as never,
      intakeMethod: method,
      ...(input.submit ? { intakeSubmittedAt: new Date(), status: job.status === 'NEW' ? 'INTAKE_RECEIVED' : job.status } : {}),
    },
  });

  if (input.submit) {
    // Seed the invitation with what the customer typed, section by section,
    // so the encoder edits rather than retypes. Sections they left blank keep
    // the defaults.
    const existing = (job.invitation.content ?? {}) as Content;
    const merged: Content = { ...existing };
    for (const [key, data] of Object.entries(cleaned)) {
      const current = existing[key as keyof Content] ?? {};
      const filled = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0)));
      merged[key as keyof Content] = { ...current, ...filled };
    }
    await prisma.invitation.update({ where: { id: invitationId }, data: { content: merged as never } });
    await notifyStaff('dfy.view', `Intake received — ${job.order.reference}`, `${user.name} sent details via ${method.toLowerCase()}`, `/admin/dfy/${job.id}`);
    await audit(user, { module: 'dfy', action: 'intake.submit', entityType: 'DfyJob', entityId: job.id, summary: method });
  }
  return updated;
}

export async function assignJob(staff: SessionUser, jobId: string, assigneeId: string | null) {
  if (assigneeId) {
    const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true, active: true } });
    if (!u || !u.active || u.role === 'CUSTOMER') throw new HttpError(400, 'Assign to an active staff member.');
  }
  const job = await prisma.dfyJob.update({ where: { id: jobId }, data: { assigneeId } });
  if (assigneeId) await notify(assigneeId, 'DFY job assigned to you', '', `/admin/dfy/${jobId}`);
  await audit(staff, { module: 'dfy', action: 'assign', entityType: 'DfyJob', entityId: jobId, summary: assigneeId ?? 'unassigned' });
  return job;
}

export async function moveJob(staff: SessionUser, jobId: string, status: DfyStatus) {
  if (!ORDER.includes(status)) throw new HttpError(400, 'Unknown status.');
  const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId }, include: { invitation: { include: { user: true } }, order: true } });
  if (status === 'PUBLISHED') return publishJob(staff, jobId);
  if (status === 'PREVIEW_SENT') return sendPreview(staff, jobId);

  const updated = await prisma.dfyJob.update({ where: { id: jobId }, data: { status } });
  await audit(staff, { module: 'dfy', action: 'move', entityType: 'DfyJob', entityId: jobId, summary: `${job.status} → ${status}` });
  return updated;
}

export async function sendPreview(staff: SessionUser, jobId: string) {
  const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId }, include: { invitation: { include: { user: true } }, order: true } });
  const previewUrl = absoluteUrl(`/account/invitations/${job.invitationId}/dfy`);
  const updated = await prisma.dfyJob.update({ where: { id: jobId }, data: { status: 'PREVIEW_SENT', previewSentAt: new Date() } });
  const s = await getSettings();
  const left = job.revisionsAllowed - job.revisionsUsed;
  await notify(job.invitation.userId, 'Your preview is ready', 'Have a look, then approve it or request changes.', `/account/invitations/${job.invitationId}/dfy`);
  await sendEmail({
    to: job.invitation.user.email,
    subject: `Your invitation preview is ready — ${job.order.reference}`,
    text: render(s['email.previewReady'], { ...(await baseVars()), customerName: job.invitation.user.name, previewUrl, revisionsLeft: left }),
  });
  await prisma.dfyRevision.create({ data: { jobId, round: job.revisionsUsed, authorId: staff.id, authorName: staff.name, byStaff: true, body: 'Preview sent. Please review and approve, or tell us what to change.' } });
  await audit(staff, { module: 'dfy', action: 'preview.send', entityType: 'DfyJob', entityId: jobId });
  return updated;
}

/** The customer asks for changes. Counts a round; the encoder replies in the same thread. */
export async function requestRevision(user: SessionUser, invitationId: string, body: string) {
  const job = await loadJobForCustomer(user, invitationId);
  if (!job) throw new HttpError(404, 'No Done-For-You job for that invitation.');
  if (job.status !== 'PREVIEW_SENT') throw new HttpError(400, 'You can request changes once a preview has been sent.');
  const text = body.trim().slice(0, 4000);
  if (!text) throw new HttpError(400, 'Tell us what to change.');
  if (job.revisionsUsed >= job.revisionsAllowed) {
    throw new HttpError(400, `You have used all ${job.revisionsAllowed} revision rounds. Message us on Messenger for anything else — small tweaks are usually fine.`);
  }
  const round = job.revisionsUsed + 1;
  await prisma.$transaction([
    prisma.dfyJob.update({ where: { id: job.id }, data: { status: 'REVISION', revisionsUsed: round } }),
    prisma.dfyRevision.create({ data: { jobId: job.id, round, authorId: user.id, authorName: user.name, byStaff: false, body: text } }),
  ]);
  await notifyStaff('dfy.view', `Revision ${round} requested — ${job.order.reference}`, text.slice(0, 120), `/admin/dfy/${job.id}`);
  if (job.assigneeId) await notify(job.assigneeId, `Revision ${round} requested`, text.slice(0, 120), `/admin/dfy/${job.id}`);
}

export async function customerComment(user: SessionUser, invitationId: string, body: string) {
  const job = await loadJobForCustomer(user, invitationId);
  if (!job) throw new HttpError(404, 'No Done-For-You job for that invitation.');
  const text = body.trim().slice(0, 4000);
  if (!text) return;
  await prisma.dfyRevision.create({ data: { jobId: job.id, round: job.revisionsUsed, authorId: user.id, authorName: user.name, byStaff: false, body: text } });
  await notifyStaff('dfy.view', `Message on ${job.order.reference}`, text.slice(0, 120), `/admin/dfy/${job.id}`);
}

export async function staffReply(staff: SessionUser, jobId: string, body: string) {
  const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId }, include: { invitation: true } });
  const text = body.trim().slice(0, 4000);
  if (!text) return;
  await prisma.dfyRevision.create({ data: { jobId, round: job.revisionsUsed, authorId: staff.id, authorName: staff.name, byStaff: true, body: text } });
  await notify(job.invitation.userId, 'Reply on your invitation', text.slice(0, 120), `/account/invitations/${job.invitationId}/dfy`);
}

export async function approveJob(user: SessionUser, invitationId: string) {
  const job = await loadJobForCustomer(user, invitationId);
  if (!job) throw new HttpError(404, 'No Done-For-You job for that invitation.');
  if (job.status !== 'PREVIEW_SENT' && job.status !== 'REVISION') throw new HttpError(400, 'There is no preview to approve yet.');
  await prisma.$transaction([
    prisma.dfyJob.update({ where: { id: job.id }, data: { status: 'APPROVED', approvedAt: new Date() } }),
    prisma.dfyRevision.create({ data: { jobId: job.id, round: job.revisionsUsed, authorId: user.id, authorName: user.name, byStaff: false, body: 'Approved — please publish.' } }),
  ]);
  await notifyStaff('dfy.view', `Approved — ${job.order.reference}`, 'Ready to publish.', `/admin/dfy/${job.id}`);
  await audit(user, { module: 'dfy', action: 'approve', entityType: 'DfyJob', entityId: job.id });
}

export async function publishJob(staff: SessionUser, jobId: string) {
  const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId }, include: { invitation: true } });
  const invitation = await publishInvitation(staff, job.invitationId);
  const updated = await prisma.dfyJob.update({ where: { id: jobId }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  await notify(job.invitation.userId, 'Your invitation is live!', `Share it: ${invitationUrl(invitation.slug)}`, `/account/invitations/${job.invitationId}`);
  await audit(staff, { module: 'dfy', action: 'publish', entityType: 'DfyJob', entityId: jobId });
  return updated;
}

export async function updateJobNotes(staff: SessionUser, jobId: string, notes: string) {
  await prisma.dfyJob.update({ where: { id: jobId }, data: { internalNotes: notes.slice(0, 8000) } });
}

export async function extendDue(staff: SessionUser, jobId: string, days: number) {
  const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId } });
  await prisma.dfyJob.update({ where: { id: jobId }, data: { dueAt: addDays(job.dueAt ?? new Date(), days) } });
}
