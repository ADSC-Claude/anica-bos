'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Privacy } from '@prisma/client';
import { requireUser, ownInvitation, action, HttpError } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { changePassword } from '@/lib/auth';
import { saveSection, updateSettings, updateTheme, changeTemplate, publish, unpublish, type ThemeOverride } from '@/lib/invitations';
import { addGuest, updateGuest, deleteGuest, importGuests, saveTable, deleteTable, assignTable, checkIn, type GuestInput } from '@/lib/guests';
import { saveIntake, requestRevision, approveJob, customerComment } from '@/lib/dfy';
import { createUpgradeOrder } from '@/lib/orders';
import { markAllRead, notifyStaff } from '@/lib/notifications';
import { setPhotoApproval, deleteGuestPhoto } from '@/lib/photos';
import type { SectionKey } from '@/lib/sections';

/**
 * Every customer action re-checks ownership through ownInvitation(); the id
 * in the URL is never trusted on its own.
 */

function refresh(id: string) {
  revalidatePath(`/account/invitations/${id}`, 'layout');
}

export async function saveSectionAction(invitationId: string, key: SectionKey, data: unknown) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const result = await saveSection(user, invitationId, key, data);
    refresh(invitationId);
    return { issues: result.issues, slug: result.invitation.slug, editsUsed: result.invitation.editsUsed, editsAllowed: result.invitation.editsAllowed };
  });
}

export async function settingsAction(invitationId: string, formData: FormData) {
  const user = await requireUser();
  const result = await action(async () => {
    await ownInvitation(user, invitationId);
    await updateSettings(user, invitationId, {
      slug: String(formData.get('slug') ?? ''),
      privacy: String(formData.get('privacy') ?? 'PUBLIC') as Privacy,
      password: String(formData.get('password') ?? ''),
      language: String(formData.get('language') ?? 'en') as 'en' | 'tl',
      title: String(formData.get('title') ?? ''),
    });
    refresh(invitationId);
  });
  return result;
}

export async function themeAction(invitationId: string, theme: ThemeOverride) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await updateTheme(user, invitationId, theme);
    refresh(invitationId);
  });
}

export async function templateAction(invitationId: string, templateId: string) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await changeTemplate(user, invitationId, templateId);
    refresh(invitationId);
  });
}

export async function publishAction(invitationId: string) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const inv = await publish(user, invitationId);
    refresh(invitationId);
    return inv.slug;
  });
}

export async function unpublishAction(invitationId: string) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await unpublish(user, invitationId);
    refresh(invitationId);
  });
}

export async function toggleRsvpAction(invitationId: string, closed: boolean) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await prisma.invitation.update({ where: { id: invitationId }, data: { rsvpClosed: closed } });
    refresh(invitationId);
  });
}

// --- guests ---------------------------------------------------------------

function guestInput(fd: FormData): GuestInput {
  return {
    name: String(fd.get('name') ?? ''),
    salutation: String(fd.get('salutation') ?? ''),
    groupName: String(fd.get('groupName') ?? ''),
    seatsAllotted: Number(fd.get('seatsAllotted') ?? 1),
    plusOneAllowed: fd.get('plusOneAllowed') === 'on',
    phone: String(fd.get('phone') ?? ''),
    email: String(fd.get('email') ?? ''),
    notes: String(fd.get('notes') ?? ''),
    tableId: String(fd.get('tableId') ?? '') || null,
  };
}

export async function addGuestAction(invitationId: string, fd: FormData) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await addGuest(inv, guestInput(fd));
    refresh(invitationId);
  });
}

export async function updateGuestAction(invitationId: string, guestId: string, fd: FormData) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await updateGuest(inv, guestId, guestInput(fd));
    refresh(invitationId);
  });
}

export async function deleteGuestAction(invitationId: string, guestId: string) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await deleteGuest(inv, guestId);
    refresh(invitationId);
  });
}

export async function importGuestsAction(invitationId: string, text: string) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    const r = await importGuests(inv, text);
    refresh(invitationId);
    return r;
  });
}

export async function saveTableAction(invitationId: string, fd: FormData) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await saveTable(inv, { id: String(fd.get('id') ?? '') || undefined, name: String(fd.get('name') ?? ''), capacity: Number(fd.get('capacity') ?? 10) });
    refresh(invitationId);
  });
}

export async function deleteTableAction(invitationId: string, tableId: string) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await deleteTable(inv, tableId);
    refresh(invitationId);
  });
}

export async function assignTableAction(invitationId: string, guestId: string, tableId: string | null) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    await assignTable(inv, guestId, tableId);
    refresh(invitationId);
  });
}

export async function checkInAction(invitationId: string, tokenOrId: string, undo = false) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    const r = await checkIn(user, inv, tokenOrId.trim().split('/').pop() ?? '', undo);
    refresh(invitationId);
    return { name: r.guest.name, table: r.guest.table?.name ?? '', alreadyIn: r.alreadyIn, seats: r.guest.seatsAllotted };
  });
}

// --- guestbook ------------------------------------------------------------

export async function moderateGuestbookAction(invitationId: string, entryId: string, decision: 'approve' | 'delete') {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    if (decision === 'approve') await prisma.guestbookEntry.updateMany({ where: { id: entryId, invitationId }, data: { approved: true } });
    else await prisma.guestbookEntry.deleteMany({ where: { id: entryId, invitationId } });
    refresh(invitationId);
  });
}

// --- guest photos -----------------------------------------------------------

export async function moderatePhotoAction(invitationId: string, photoId: string, decision: 'approve' | 'hide' | 'delete') {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    if (decision === 'delete') await deleteGuestPhoto(invitationId, photoId);
    else await setPhotoApproval(invitationId, photoId, decision === 'approve');
    refresh(invitationId);
  });
}

// --- DFY --------------------------------------------------------------------

export async function saveIntakeAction(invitationId: string, input: { content: unknown; method: string; notes: string; submit: boolean }) {
  const user = await requireUser();
  return action(async () => {
    await saveIntake(user, invitationId, input);
    refresh(invitationId);
  });
}

export async function requestRevisionAction(invitationId: string, body: string) {
  const user = await requireUser();
  return action(async () => {
    await requestRevision(user, invitationId, body);
    refresh(invitationId);
  });
}

export async function commentAction(invitationId: string, body: string) {
  const user = await requireUser();
  return action(async () => {
    await customerComment(user, invitationId, body);
    refresh(invitationId);
  });
}

export async function approveAction(invitationId: string) {
  const user = await requireUser();
  return action(async () => {
    await approveJob(user, invitationId);
    refresh(invitationId);
  });
}

// --- orders, account ------------------------------------------------------

export async function upgradeAction(invitationId: string, tier: 'STANDARD' | 'COMPLETE') {
  const user = await requireUser();
  const result = await action(async () => {
    await ownInvitation(user, invitationId);
    const order = await createUpgradeOrder(user, invitationId, tier);
    return order;
  });
  if (!result.ok) return result;
  refresh(invitationId);
  if (result.data.totalCents === 0) redirect(`/account/invitations/${invitationId}`);
  redirect(`/checkout/pay/${result.data.reference}`);
}

export async function markReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath('/account/notifications');
}

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const user = await requireUser();
  try {
    await changePassword(user.id, String(fd.get('current') ?? ''), String(fd.get('next') ?? ''));
    return { ok: true };
  } catch (err) {
    return { error: err instanceof HttpError ? err.message : 'Could not change the password.' };
  }
}

export async function supportMessageAction(invitationId: string | null, fd: FormData) {
  const user = await requireUser();
  return action(async () => {
    const body = String(fd.get('body') ?? '').trim().slice(0, 4000);
    if (!body) throw new HttpError(400, 'Write a message first.');
    if (invitationId) await ownInvitation(user, invitationId);
    await prisma.supportMessage.create({ data: { userId: user.id, invitationId, body, channel: 'app' } });
    await notifyStaff('support.view', `Message from ${user.name}`, body.slice(0, 120), '/admin/support');
    revalidatePath('/account/support');
  });
}
