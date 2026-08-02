import { prisma } from './db';
import { isNotApplicable } from './intake';

export type MedicalAlert = { label: string; detail: string };

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
