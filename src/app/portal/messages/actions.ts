'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { dateKeyToBusinessDate, manilaDateKey } from '@/lib/datetime';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function sendMessageAction(formData: FormData) {
  const user = await requirePage('messages.use');
  const toUserId = str(formData, 'toUserId');
  const body = str(formData, 'body');
  if (!toUserId || !body) return;

  await prisma.directMessage.create({ data: { fromUserId: user.id, toUserId, body } });
  await notify({
    kind: 'DIRECT_MESSAGE',
    title: `New message from ${user.name}`,
    body: body.slice(0, 120),
    link: `/portal/messages?with=${user.id}`,
    dedupeKey: `dm:${user.id}:${toUserId}`,
    userId: toUserId,
  });
  await audit(user, {
    module: 'messages', action: 'send_dm', entityType: 'DirectMessage',
    summary: `Sent a direct message`,
  });
  revalidatePath('/portal/messages');
}

export async function markMessagesReadAction(formData: FormData) {
  const user = await requirePage('messages.use');
  const fromUserId = str(formData, 'fromUserId');
  if (!fromUserId) return;
  await prisma.directMessage.updateMany({
    where: { fromUserId, toUserId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/portal/messages');
}

export async function postAnnouncementAction(formData: FormData) {
  const user = await requirePage('announcements.post');
  const title = str(formData, 'title');
  const body = str(formData, 'body');
  if (!title || !body) return;

  const announcement = await prisma.announcement.create({
    data: { authorId: user.id, branchId: user.branchId, title, body },
  });
  await notify({
    kind: 'ANNOUNCEMENT',
    title: `Announcement: ${title}`,
    body: body.slice(0, 140),
    link: '/portal/messages?tab=announcements',
    dedupeKey: `announcement:${announcement.id}`,
    branchId: user.branchId,
    roles: ['OWNER', 'ADMIN', 'RECEPTIONIST'],
  });
  await audit(user, {
    module: 'messages', action: 'post_announcement', entityType: 'Announcement',
    entityId: announcement.id, summary: `Posted "${title}"`,
  });
  revalidatePath('/portal/messages');
  revalidatePath('/portal');
}

export async function acknowledgeAnnouncementAction(formData: FormData) {
  const user = await requirePage('messages.use');
  const id = str(formData, 'id');
  if (!id) return;
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: user.id } },
    create: { announcementId: id, userId: user.id },
    update: {},
  });
  revalidatePath('/portal/messages');
  revalidatePath('/portal');
}

export async function postShiftNoteAction(formData: FormData) {
  const user = await requirePage('shiftnotes.write');
  const branchId = await resolveBranchId(user, null);
  const body = str(formData, 'body');
  if (!body) return;

  const note = await prisma.shiftNote.create({
    data: {
      branchId,
      authorId: user.id,
      body,
      noteDate: dateKeyToBusinessDate(str(formData, 'noteDate') || manilaDateKey()),
      clientId: str(formData, 'clientId') || null,
      appointmentId: str(formData, 'appointmentId') || null,
    },
  });
  await audit(user, {
    module: 'messages', action: 'shift_note', entityType: 'ShiftNote', entityId: note.id,
    summary: body.slice(0, 120), branchId,
  });
  revalidatePath('/portal/messages');
}

export async function commentShiftNoteAction(formData: FormData) {
  const user = await requirePage('messages.use');
  const noteId = str(formData, 'noteId');
  const body = str(formData, 'body');
  if (!noteId || !body) return;
  await prisma.shiftNoteComment.create({ data: { noteId, userId: user.id, body } });
  await audit(user, {
    module: 'messages', action: 'shift_note_comment', entityType: 'ShiftNote', entityId: noteId,
    summary: body.slice(0, 120),
  });
  revalidatePath('/portal/messages');
}
