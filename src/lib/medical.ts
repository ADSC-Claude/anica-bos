import { prisma } from './db';
import { isNotApplicable } from './intake';
import { audit } from './audit';
import { startOfManilaDay, manilaDateKey } from './datetime';
import type { SessionUser } from './auth';

export type MedicalAlert = { label: string; detail: string };

/**
 * How a health record came to be on someone's screen.
 *
 * `record` is a deliberate act — somebody opened the health intake tab and read
 * the answers. `alerts` is the safety summary that appears on an appointment
 * card and at POS without being asked for. Both disclose health information and
 * both are logged, but they are not the same act and the log should not pretend
 * they are: a receptionist checking an allergy before a massage is doing their
 * job, and a receptionist opening thirty health records in an afternoon is not.
 */
export type MedicalAccessKind = 'record' | 'alerts';

/**
 * Write down that someone looked at a client's health information.
 *
 * The Receptionist role holds `clients.medical` on purpose — the person taking
 * the booking is the one who has to know about the allergy, and a permission
 * that has to be escalated before a treatment is a permission that gets shared
 * around instead. Access control was never going to be the protection here.
 * Accountability is: the spa can say who opened which record and when, which is
 * what the Data Privacy Act asks of a personal information controller and what
 * the consent form now promises the client.
 *
 * Deduped to one entry per user, per client, per Manila day. An audit trail
 * that records every re-render buries the afternoon somebody read through the
 * client list in ten thousand rows of noise, and a trail nobody can read is not
 * a trail. The day is the unit that answers the question actually worth asking.
 *
 * Never throws: a failed log must not be able to keep a therapist from seeing
 * an allergy warning. It is written before the read rather than after, so a
 * page that crashes half-way still leaves the access recorded.
 */
export async function recordMedicalAccess(
  user: SessionUser,
  clientId: string,
  kind: MedicalAccessKind = 'record',
): Promise<void> {
  try {
    const since = startOfManilaDay(manilaDateKey());
    const already = await prisma.auditLog.findFirst({
      where: {
        userId: user.id,
        module: 'clients',
        action: `medical_${kind}`,
        entityId: clientId,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (already) return;

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, branchId: true },
    });
    if (!client) return;

    await audit(user, {
      module: 'clients',
      action: `medical_${kind}`,
      entityType: 'Client',
      entityId: clientId,
      summary:
        kind === 'record'
          ? `Opened the health record of ${client.name}`
          : `Shown the health warnings for ${client.name}`,
      sensitive: true,
      branchId: client.branchId,
    });
  } catch {
    // Logging the look-up must never break the look-up.
  }
}

/**
 * Which of a client's answers should be surfaced as a visible warning on the
 * appointment card and at POS, so the therapist is told before the service.
 * Driven by the `alertValues` configured per question in Settings.
 */
export async function medicalAlertsFor(clientIds: string[]): Promise<Map<string, MedicalAlert[]>> {
  const out = new Map<string, MedicalAlert[]>();
  if (!clientIds.length) return out;

  const values = await prisma.clientFieldValue.findMany({
    where: {
      clientId: { in: clientIds },
      definition: { retired: false, section: 'MEDICAL' },
    },
    include: { definition: true },
  });

  for (const v of values) {
    const def = v.definition;
    const raw = v.value;
    let flagged = false;
    let detail = '';

    if (def.alertValues.length) {
      const asString = typeof raw === 'boolean' ? String(raw) : String(raw ?? '');
      flagged = def.alertValues.includes(asString);
      detail = asString === 'true' ? 'Yes' : asString;
    } else if (typeof raw === 'string' && raw.trim() && !isNotApplicable(raw)) {
      // Free-text answers (allergies, medications) always matter — except the
      // ones that say there is nothing to report. Now that the checklist has to
      // be answered, "no allergies" is stored rather than left blank, and
      // alerting on it would put a line on every appointment card and bury the
      // warnings that are real.
      flagged = true;
      detail = raw.trim();
    }

    if (!flagged) continue;
    const list = out.get(v.clientId) ?? [];
    list.push({ label: def.label, detail });
    out.set(v.clientId, list);
  }

  return out;
}
