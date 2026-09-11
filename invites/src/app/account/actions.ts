'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Occasion, Privacy, Tier } from '@prisma/client';
import { requireUser, ownInvitation, action, HttpError } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { changePassword } from '@/lib/auth';
import { saveSection, updateSettings, updateTheme, changeTemplate, publish, unpublish, type ThemeOverride, setSectionDone, setPremiumOpening } from '@/lib/invitations';
import { addGuest, updateGuest, deleteGuest, importGuests, importGuestRows, saveTable, deleteTable, assignTable, checkIn, setArrived, type GuestInput } from '@/lib/guests';
import { readXlsx, looksLikeXlsx } from '@/lib/xlsx';
import { parseCsv } from '@/lib/csv';
import { seatsHeld, replyState } from '@/lib/seats';
import { saveIntake, requestRevision, approveJob, customerComment } from '@/lib/dfy';
import { createUpgradeOrder } from '@/lib/orders';
import { markAllRead, notifyStaff } from '@/lib/notifications';
import { setPhotoApproval, deleteGuestPhoto } from '@/lib/photos';
import { planReminders, sendReminders, planEmailReminders, sendEmailReminders } from '@/lib/reminders';
import { eraseCustomer } from '@/lib/privacy';
import { destroySession } from '@/lib/auth';
import type { SectionKey } from '@/lib/sections';
import { entitled } from '@/lib/tiers';
import { withTone, withOverride, withPicked, type MessageKind, type Tone } from '@/lib/messages';
import { CAMPAIGN_KINDS } from '@/lib/campaigns';

/**
 * Every customer action re-checks ownership through ownInvitation(); the id
 * in the URL is never trusted on its own.
 */

function refresh(id: string) {
  revalidatePath(`/account/invitations/${id}`, 'layout');
}

export async function saveSectionAction(invitationId: string, key: SectionKey, data: unknown, opts: { done?: boolean } = {}) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const result = await saveSection(user, invitationId, key, data, opts);
    refresh(invitationId);
    return { issues: result.issues, slug: result.invitation.slug, done: result.done, completedAt: result.completedAt };
  });
}

/** Reopen a section marked Done (or mark it Done again) without saving anything else. */
export async function sectionDoneAction(invitationId: string, key: SectionKey, done: boolean) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const list = await setSectionDone(user, invitationId, key, done);
    refresh(invitationId);
    return { done: list };
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

/** The language the guest page speaks, switched from the builder. */
export async function languageAction(invitationId: string, language: 'en' | 'tl') {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await updateSettings(user, invitationId, { language: language === 'tl' ? 'tl' : 'en' });
    refresh(invitationId);
  });
}

export async function themeAction(invitationId: string, theme: ThemeOverride) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await updateTheme(user, invitationId, theme);
    refresh(invitationId);
  });
}

/** Which of the design's premium openings plays, once the add-on is theirs. */
export async function premiumOpeningAction(invitationId: string, key: string) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    await setPremiumOpening(user, invitationId, key);
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

export async function publishAction(invitationId: string, acceptedBlanks?: string[]) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const inv = await publish(user, invitationId, acceptedBlanks);
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

/**
 * A guest list as a file: the workbook they keep it in, or the CSV either
 * spreadsheet saves. Reading the workbook matters because saving as CSV is the
 * step people miss, and the upload that follows looks like it simply failed.
 */
export async function importGuestFileAction(invitationId: string, form: FormData) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a file first.');
    if (file.size > 5_000_000) throw new HttpError(400, 'That file is larger than 5 MB. A guest list of 2,000 names is far smaller — is it the right file?');

    const bytes = Buffer.from(await file.arrayBuffer());
    let rows: string[][];
    if (looksLikeXlsx(bytes)) {
      try {
        rows = readXlsx(bytes);
      } catch {
        throw new HttpError(400, 'That looks like a spreadsheet but could not be read. Save it as CSV and try again.');
      }
    } else {
      rows = parseCsv(bytes.toString('utf8'));
    }

    const r = await importGuestRows(inv, rows);
    refresh(invitationId);
    return r;
  });
}

/**
 * A spreadsheet read into rows, for the repeatable parts of an invitation —
 * the sponsors, the programme, the FAQ, the moments in a story.
 *
 * It returns the grid rather than saving anything. The section forms hold their
 * own edits until the customer saves the section, and an upload that wrote
 * straight through would be the one change on the page that could not be undone
 * by walking away. Parsing is here rather than in the browser because reading
 * an .xlsx wants Node's inflate.
 */
export async function parseSheetAction(invitationId: string, form: FormData) {
  const user = await requireUser();
  return action(async () => {
    await ownInvitation(user, invitationId);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a file first.');
    if (file.size > 5_000_000) throw new HttpError(400, 'That file is larger than 5 MB — is it the right one?');
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!looksLikeXlsx(bytes)) return parseCsv(bytes.toString('utf8'));
    try {
      return readXlsx(bytes);
    } catch {
      throw new HttpError(400, 'That looks like a spreadsheet but could not be read. Save it as CSV and try again.');
    }
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
    // seatsAllotted was reported here regardless of the reply, so the door was
    // told the number set aside rather than the number confirmed: a guest
    // offered three places who is bringing one had three laid for them, and a
    // guest who declined and came anyway had their full allotment.
    return { name: r.guest.name, table: r.guest.table?.name ?? '', alreadyIn: r.alreadyIn, seats: seatsHeld(r.guest.seatsAllotted, r.guest.rsvps[0]), state: replyState(r.guest.rsvps[0]), arrived: r.guest.arrivedCount };
  });
}

/** How many of a party walked in, corrected at the door. */
export async function setArrivedAction(invitationId: string, guestId: string, count: number) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    const g = await setArrived(inv, guestId, count);
    refresh(invitationId);
    return { name: g.name, seats: seatsHeld(g.seatsAllotted, g.rsvps[0]), arrived: g.arrivedCount ?? 0 };
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

// --- the Data Privacy Act ---------------------------------------------------

const ERASE_PHRASE = 'DELETE MY ACCOUNT';

export async function eraseMyAccountAction(confirmation: string) {
  const user = await requireUser();
  const result = await action(async () => {
    if (confirmation !== ERASE_PHRASE) throw new HttpError(400, `Type ${ERASE_PHRASE} to confirm.`);
    await eraseCustomer(user, user.id, 'Requested by the account holder from their dashboard');
    await destroySession();
  });
  // The redirect has to happen outside action(), which catches everything —
  // including the exception Next throws to perform a redirect.
  if (result.ok) redirect('/?erased=1');
  return result;
}

// --- SMS reminders ----------------------------------------------------------

/** What a blast would do, without doing it — the confirmation step reads this. */
export async function previewRemindersAction(invitationId: string, everyone: boolean) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    if (!entitled(inv, 'guests.manager')) throw new HttpError(403, 'Upgrade to send reminders.');
    const plan = await planReminders(inv, { everyone });
    return {
      count: plan.send.length,
      credits: plan.credits,
      sample: plan.send[0]?.text ?? '',
      skipped: plan.skipped,
    };
  });
}

export async function sendRemindersAction(invitationId: string, everyone: boolean) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    if (!entitled(inv, 'guests.manager')) throw new HttpError(403, 'Upgrade to send reminders.');
    const outcome = await sendReminders(inv, { everyone });
    refresh(invitationId);
    return outcome;
  });
}

// --- e-mail reminders -------------------------------------------------------

/**
 * The same two steps as the text blast, and deliberately so: free is not the
 * same as harmless, and two hundred guests reading a mistake is two hundred
 * guests either way.
 */
export async function previewEmailRemindersAction(invitationId: string, everyone: boolean) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    if (!entitled(inv, 'guests.manager')) throw new HttpError(403, 'Upgrade to send reminders.');
    const plan = await planEmailReminders(inv, { everyone });
    return {
      count: plan.send.length,
      sample: plan.send[0] ? `${plan.send[0].subject}\n\n${plan.send[0].body}` : '',
      skipped: plan.skipped,
    };
  });
}

export async function sendEmailRemindersAction(invitationId: string, everyone: boolean) {
  const user = await requireUser();
  return action(async () => {
    const inv = await ownInvitation(user, invitationId);
    if (!entitled(inv, 'guests.manager')) throw new HttpError(403, 'Upgrade to send reminders.');
    const outcome = await sendEmailReminders(inv, { everyone });
    refresh(invitationId);
    return outcome;
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

export async function upgradeAction(invitationId: string, tier: Tier) {
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

// ---------------------------------------------------------------------------
// What the guests are sent
// ---------------------------------------------------------------------------

/**
 * These three are posted from plain forms on a server-rendered page, so they
 * return nothing and send the reader back to the page rather than handing a
 * result to a client component the way the builder's actions do. Same shape as
 * the admin tables, for the same reason: there is nothing to show except the
 * page with the change on it.
 */
async function messagesAction(invitationId: string, fn: (inv: { id: string; occasion: Occasion; guestMessages: unknown }) => Promise<void>): Promise<void> {
  const user = await requireUser();
  const inv = await ownInvitation(user, invitationId);
  const back = `/account/invitations/${invitationId}/messages`;
  try {
    await fn(inv);
  } catch (err) {
    if (typeof (err as { digest?: string })?.digest === 'string') throw err;
    const text = err instanceof HttpError ? err.message : 'Something went wrong.';
    console.error('[messages action]', err);
    refresh(invitationId);
    redirect(`${back}?error=${encodeURIComponent(text)}`);
  }
  refresh(invitationId);
  redirect(back);
}

/**
 * The tone, and any line the couple rewrites.
 *
 * Both write the whole preferences object back rather than patching the column
 * in place, because the merge rules — a line equal to the stock one is not an
 * override, and changing tone keeps the rewrites — live in src/lib/messages.ts
 * next to the words they are about.
 */
export async function setMessageToneAction(invitationId: string, tone: string): Promise<void> {
  return messagesAction(invitationId, async (inv) => {
    const picked: Tone = tone === 'formal' ? 'formal' : 'heartfelt';
    await prisma.invitation.update({ where: { id: inv.id }, data: { guestMessages: withTone(inv.guestMessages, picked) } });
  });
}

export async function saveMessageAction(invitationId: string, kind: MessageKind, fd: FormData): Promise<void> {
  return messagesAction(invitationId, async (inv) => {
    // A text is charged by the segment and an inbox is not, so only the text is
    // capped — at roughly four segments, which is already more than anyone
    // should send and well short of where Semaphore starts refusing.
    const sms = String(fd.get('sms') ?? '').slice(0, 600);
    const emailSubject = String(fd.get('emailSubject') ?? '').slice(0, 200);
    const emailBody = String(fd.get('emailBody') ?? '').slice(0, 4000);
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { guestMessages: withOverride(inv.guestMessages, inv.occasion, kind, { sms, emailSubject, emailBody }) },
    });
  });
}

/** Puts one message back to the library's words for this occasion and tone. */
export async function resetMessageAction(invitationId: string, kind: MessageKind): Promise<void> {
  return messagesAction(invitationId, async (inv) => {
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { guestMessages: withOverride(inv.guestMessages, inv.occasion, kind, { sms: '', emailSubject: '', emailBody: '' }) },
    });
  });
}

/** Which of the scheduled messages go out, for a campaign that covers some. */
export async function setPickedMessagesAction(invitationId: string, fd: FormData): Promise<void> {
  return messagesAction(invitationId, async (inv) => {
    const picked = fd.getAll('picked').map(String).filter((k): k is MessageKind =>
      CAMPAIGN_KINDS.includes(k as MessageKind));
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { guestMessages: withPicked(inv.guestMessages, picked) },
    });
  });
}
