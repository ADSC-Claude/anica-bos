/**
 * "Nothing to report" is an answer, and it must not read as a warning.
 *
 * The health checklist now has to be answered before a booking goes through,
 * so the written questions come back filled in every time — most often with
 * N/A. Free-text medical answers are alerted on by default, which is right for
 * "almond oil" and badly wrong for "N/A": an alert on every appointment card is
 * an alert the therapist stops reading, and the one that mattered goes with it.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { medicalAlertsFor } from '../src/lib/medical';
import { NOT_APPLICABLE, isAnswered, isNotApplicable } from '../src/lib/intake';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
let branchId: string;
let clientId: string;
const defIds: string[] = [];

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `na-${stamp}`, code: `NA${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;
  clientId = (
    await prisma.client.create({
      data: {
        branchId,
        name: `Test Guest ${stamp}`,
        mobile: `09${String(Date.now()).slice(-9)}`,
        email: `na-${stamp}@x.test`,
        addressCity: 'QC',
      },
    })
  ).id;

  // Its own questions rather than the seed's: CI migrates a database and never
  // seeds it, so a test leaning on seeded rows passes here and fails there.
  const mkDef = async (key: string, label: string, type: 'TEXT' | 'BOOLEAN', alert: string[]) =>
    (
      await prisma.clientFieldDefinition.create({
        data: { key: `${key}_${stamp}`, label, section: 'MEDICAL', type, alertValues: alert },
      })
    ).id;

  const allergies = await mkDef('allergies', 'Allergies', 'TEXT', []);
  const notes = await mkDef('notes', 'Other conditions', 'TEXT', []);
  const diabetes = await mkDef('diabetes', 'Diabetes', 'BOOLEAN', ['true']);
  defIds.push(allergies, notes, diabetes);

  await prisma.clientFieldValue.createMany({
    data: [
      { clientId, definitionId: allergies, value: NOT_APPLICABLE },
      { clientId, definitionId: notes, value: 'Prefers no pressure on the lower back.' },
      { clientId, definitionId: diabetes, value: true },
    ],
  });
});

after(async () => {
  await prisma.clientFieldValue.deleteMany({ where: { clientId } });
  await prisma.clientFieldDefinition.deleteMany({ where: { id: { in: defIds } } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

test('N/A is recognised however it was written down', () => {
  for (const v of ['N/A', 'n/a', ' N/A ', 'na', 'N.A.', 'n/a.']) {
    assert.equal(isNotApplicable(v), true, `${JSON.stringify(v)} means nothing to report`);
  }
});

test('a real answer is never mistaken for N/A', () => {
  // "Nasal spray" starts with the same two letters and is a medication.
  for (const v of ['Almond oil', 'Nasal spray', 'nuts', '', 'Na-Cl scrub']) {
    assert.equal(isNotApplicable(v), false, `${JSON.stringify(v)} is not a waive-off`);
  }
});

test('answered means something was said, including N/A', () => {
  assert.equal(isAnswered('N/A'), true, 'N/A is the guest telling us there is nothing');
  assert.equal(isAnswered('Almond oil'), true);
  assert.equal(isAnswered(true), true);
  assert.equal(isAnswered(['a']), true);

  assert.equal(isAnswered(''), false, 'a blank box is not an answer');
  assert.equal(isAnswered('   '), false, 'nor is a box holding only spaces');
  assert.equal(isAnswered(undefined), false, 'nor is a question never reached');
  assert.equal(isAnswered(false), false, 'nor is an unticked box');
  assert.equal(isAnswered([]), false);
});

test('N/A does not become a therapist alert', async () => {
  const alerts = (await medicalAlertsFor([clientId])).get(clientId) ?? [];
  const labels = alerts.map((a) => a.label);
  assert.ok(!labels.includes('Allergies'), 'no allergies is not a warning about allergies');
});

test('the answers that do matter still come through', async () => {
  const alerts = (await medicalAlertsFor([clientId])).get(clientId) ?? [];
  const byLabel = new Map(alerts.map((a) => [a.label, a.detail]));

  assert.equal(
    byLabel.get('Other conditions'),
    'Prefers no pressure on the lower back.',
    'a written answer still reaches the therapist',
  );
  assert.equal(byLabel.get('Diabetes'), 'Yes', 'a ticked condition still reaches the therapist');
  assert.equal(alerts.length, 2, 'exactly the two that were said, and not the N/A');
});
