import 'server-only';
import { prisma } from './db';
import { audit } from './audit';
import type { SessionUser } from './auth';

/**
 * Erasing a client without erasing the books.
 *
 * RA 10173 gives a client the right to have her personal information taken out
 * of the spa's records. The BIR gives the spa ten years it must keep its
 * receipts. Both are real obligations and they meet on the same row, because
 * every sale points at a client.
 *
 * `deletable.ts` already refuses to delete a client with any history, and that
 * refusal is right — a receipt whose customer has vanished is a gap in a
 * gapless series, which is what an examiner reads as a concealed sale. But a
 * refusal is not an answer to a woman who has asked to be forgotten. This is
 * the answer: the row stays and is emptied.
 *
 * The line drawn below is the whole point of this module, so it is written out
 * rather than left to be inferred from the code:
 *
 *   Removed — everything that says *who she is*: name, mobile, email, birthday,
 *   address, notes, tags, PWD and Senior ID numbers, every health answer, her
 *   consent record, the follow-up notes staff wrote about her, the shift notes
 *   that mention her, her email history, and the photographs of her bank and
 *   GCash receipts sitting in the deposit-proof fields.
 *
 *   Kept — everything that says *what was sold*: sales, receipt numbers, sale
 *   lines, payments, discounts, commissions, journal entries, the appointments
 *   themselves and their times. None of it identifies her once the row above is
 *   empty, and all of it has to reconcile.
 *
 * Two kept things are worth naming because they look like exceptions:
 *
 *   `SaleDiscount.idNumber` holds the PWD or Senior ID quoted at checkout. It
 *   stays. It is printed on the receipt and it is the evidence for the discount
 *   claimed against it — removing it turns a lawful discount into an
 *   unexplained one. The copy on the client record is deleted, so what remains
 *   is on the receipt where BIR requires it and nowhere else.
 *
 *   `Appointment.depositReference` is the GCash or bank reference for money
 *   received. It stays for the same reason: it is how a payment is traced. The
 *   *image* of that receipt does not stay — a screenshot shows an account name
 *   and a balance, none of which the spa ever needed.
 */

/** What an erasure took out, for the confirmation message. */
export type ErasureResult = {
  fieldValues: number;
  followUps: number;
  feedback: number;
  emailLogs: number;
  shiftNotes: number;
  appointmentsScrubbed: number;
  proofImagesRemoved: number;
};

/**
 * The mobile number has to stay unique per branch, so it cannot simply be
 * blanked — two erased clients at one branch would collide on `''` and the
 * second erasure would fail. Derived from the id, which is already meaningless
 * to everyone but the database.
 */
function erasedMobile(clientId: string): string {
  return `erased:${clientId}`;
}

export async function eraseClientPersonalData(
  user: SessionUser,
  clientId: string,
): Promise<ErasureResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, branchId: true, erasedAt: true },
  });
  if (!client) throw new Error('That client no longer exists.');
  if (client.erasedAt) throw new Error('This record has already been erased.');

  const result = await prisma.$transaction(async (tx) => {
    // Health answers. The reason this module exists.
    const fieldValues = await tx.clientFieldValue.deleteMany({ where: { clientId } });

    // "Called her, she is recovering from the surgery" — staff notes about a
    // person are about that person whoever wrote them down.
    const followUps = await tx.clientFollowUp.deleteMany({ where: { clientId } });

    // Her words and her rating. The rating is anonymous once the client row is
    // empty and therapist averages depend on it, so the row survives with the
    // comment taken out — and unpublished, because a quote on the landing page
    // is the one place her feedback is not anonymous at all.
    const feedback = await tx.clientFeedback.updateMany({
      where: { clientId },
      data: { comment: '', showOnLanding: false, recordedBy: '' },
    });

    // Holds her email address beside every message sent to it.
    const emailLogs = await tx.emailLog.deleteMany({ where: { clientId } });

    // Written by staff, about her, in free text. Nothing in them reconciles.
    const shiftNotes = await tx.shiftNote.deleteMany({ where: { clientId } });

    // Appointment rows stay — they are what the sales hang off — but the free
    // text and the deposit screenshots on them do not.
    const proofImages = await tx.appointment.count({
      where: { clientId, depositProofUrl: { not: '' } },
    });
    const appointments = await tx.appointment.updateMany({
      where: { clientId },
      data: { notes: '', guestName: '', depositProofUrl: '' },
    });

    await tx.client.update({
      where: { id: clientId },
      data: {
        name: 'Erased client',
        mobile: erasedMobile(clientId),
        email: '',
        birthday: null,
        addressCity: '',
        addressLine: '',
        barangay: '',
        notes: '',
        tags: [],
        pwdIdNumber: '',
        seniorIdNumber: '',
        // Consent to hold information the spa no longer holds is not consent to
        // anything, and leaving the tick would let the next screen treat this
        // shell as a client who has agreed to something.
        consentGiven: false,
        consentAt: null,
        waiverGiven: false,
        waiverAt: null,
        medicalUpdatedAt: null,
        followUpSnoozedUntil: null,
        loyaltyPoints: 0,
        incomplete: false,
        erasedAt: new Date(),
      },
    });

    return {
      fieldValues: fieldValues.count,
      followUps: followUps.count,
      feedback: feedback.count,
      emailLogs: emailLogs.count,
      shiftNotes: shiftNotes.count,
      appointmentsScrubbed: appointments.count,
      proofImagesRemoved: proofImages,
    };
  });

  /**
   * Recorded without her name, on purpose.
   *
   * The spa has to be able to show that an erasure happened — that is what
   * makes it accountable rather than merely obliging. But an audit entry
   * reading "Erased the record of Maria Santos" puts Maria Santos back into the
   * database, in an append-only table nobody can ever take her out of again.
   * The client id is enough: it says which record, it is meaningless to a
   * reader, and it still points at the shell if anyone needs to check the work.
   */
  await audit(user, {
    module: 'clients',
    action: 'erase_personal_data',
    entityType: 'Client',
    entityId: clientId,
    summary:
      'Erased a client record on request under RA 10173 — health answers, ' +
      'contact details and deposit proof images removed; sales, receipts and ' +
      'journals kept for BIR. The client is deliberately not named here.',
    sensitive: true,
    branchId: client.branchId,
    after: result as unknown as Record<string, number>,
  });

  return result;
}
