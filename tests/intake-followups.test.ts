/**
 * A tick that asks the obvious next question.
 *
 *   "when you click something thats needing a follow up question, create a
 *    follow up question that will be answered."
 *
 * "Recent surgery or injury" on its own tells a therapist to be careful of
 * something without saying what or where — the half of the answer that
 * matters, and the half she would otherwise have to ask for on the table with
 * the guest already undressed.
 *
 * Two other things ride along. Medications was a free-text box that was never
 * shown to anyone booking online, so it became a tick with a follow-up. And a
 * blank checklist could not be told from a skipped one, so there is now a way
 * to answer *no* out loud.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

before(async () => {
  // The fields come from the migration, not from a fixture: what is being
  // checked is that a real catalogue of questions hangs together.
});

after(async () => {
  await prisma.$disconnect();
});

const byKey = async (key: string) =>
  prisma.clientFieldDefinition.findUnique({ where: { key } });

test('every condition that needs elaborating has a follow-up', async () => {
  const needing = [
    'hypertension', 'heart_condition', 'diabetes', 'pregnancy',
    'recent_surgery', 'skin_condition', 'varicose_veins',
  ];
  for (const key of needing) {
    const parent = await byKey(key);
    assert.ok(parent, `${key} exists`);
    const followUp = await prisma.clientFieldDefinition.findFirst({
      where: { dependsOnKey: key },
    });
    assert.ok(followUp, `${key} asks a follow-up`);
    assert.equal(followUp.section, 'MEDICAL');
    assert.ok(followUp.showOnline, 'and asks it of guests booking online too');
  }
});

test('a follow-up points at a question that exists and is a tick box', async () => {
  // A follow-up hanging off a missing or free-text parent would never appear,
  // and nobody would notice until a therapist needed the answer.
  const followUps = await prisma.clientFieldDefinition.findMany({
    where: { dependsOnKey: { not: null }, retired: false },
  });
  assert.ok(followUps.length >= 8);
  for (const f of followUps) {
    const parent = await byKey(f.dependsOnKey!);
    assert.ok(parent, `${f.key} depends on ${f.dependsOnKey}, which exists`);
    assert.equal(parent.type, 'BOOLEAN', `${f.dependsOnKey} is something you tick`);
    assert.equal(parent.retired, false, `${f.dependsOnKey} is still asked`);
  }
});

test('a follow-up never depends on itself or on another follow-up', async () => {
  // One level only. A chain would leave an answer visible under a question
  // that is itself hidden.
  const followUps = await prisma.clientFieldDefinition.findMany({
    where: { dependsOnKey: { not: null } },
  });
  for (const f of followUps) {
    assert.notEqual(f.dependsOnKey, f.key);
    const parent = await byKey(f.dependsOnKey!);
    assert.equal(parent?.dependsOnKey, null, `${f.dependsOnKey} is not itself a follow-up`);
  }
});

test('medications is a tick with a follow-up, and guests are finally asked', async () => {
  const tick = await byKey('medications_taking');
  assert.ok(tick);
  assert.equal(tick.type, 'BOOLEAN');
  assert.ok(tick.showOnline, 'the online form asks it now');
  assert.ok(tick.alertValues.includes('true'), 'and it flags on the appointment card');

  const detail = await byKey('medications');
  assert.ok(detail);
  assert.equal(detail.dependsOnKey, 'medications_taking');
  assert.ok(detail.showOnline, 'it used to be portal-only, so nobody online was asked');
});

test('there is exactly one "none of the above", and it is a tick', async () => {
  const none = await prisma.clientFieldDefinition.findMany({
    where: { isNoneOption: true, retired: false },
  });
  assert.equal(none.length, 1, 'two of them would be a contradiction waiting to happen');
  assert.equal(none[0].type, 'BOOLEAN');
  assert.equal(none[0].section, 'MEDICAL');
  assert.equal(none[0].dependsOnKey, null, 'it is never hidden behind another answer');
  assert.equal(none[0].alertValues.length, 0, 'answering "nothing applies" is not an alert');
});

/**
 * The rule the form applies when a box is ticked, kept here in one place so it
 * can be checked without a browser. Mirrors `setMedical` in the booking form.
 */
function applyTick(
  answers: Record<string, unknown>,
  key: string,
  value: unknown,
  fields: { key: string; dependsOnKey: string | null; isNoneOption: boolean }[],
): Record<string, unknown> {
  const next = { ...answers, [key]: value };
  const none = fields.find((f) => f.isNoneOption);
  const others = fields.filter((f) => !f.isNoneOption);
  if (none && key === none.key && value) {
    for (const f of others) delete next[f.key];
  } else if (none && value && key !== none.key) {
    delete next[none.key];
  }
  if (!value) {
    for (const f of fields.filter((x) => x.dependsOnKey === key)) delete next[f.key];
  }
  return next;
}

const FIELDS = [
  { key: 'recent_surgery', dependsOnKey: null, isNoneOption: false },
  { key: 'recent_surgery_detail', dependsOnKey: 'recent_surgery', isNoneOption: false },
  { key: 'none_apply', dependsOnKey: null, isNoneOption: true },
];

test('"none of the above" clears the conditions and what they asked about', () => {
  let answers: Record<string, unknown> = {};
  answers = applyTick(answers, 'recent_surgery', true, FIELDS);
  answers = applyTick(answers, 'recent_surgery_detail', 'knee, March', FIELDS);
  answers = applyTick(answers, 'none_apply', true, FIELDS);

  assert.deepEqual(answers, { none_apply: true });
});

test('ticking a condition lets go of "none of the above"', () => {
  let answers: Record<string, unknown> = applyTick({}, 'none_apply', true, FIELDS);
  answers = applyTick(answers, 'recent_surgery', true, FIELDS);

  assert.equal(answers.none_apply, undefined, 'she cannot have none and one');
  assert.equal(answers.recent_surgery, true);
});

test('unticking a condition drops the answer it had revealed', () => {
  // Otherwise a sentence about last year's surgery stays on a record that now
  // says there was none.
  let answers: Record<string, unknown> = applyTick({}, 'recent_surgery', true, FIELDS);
  answers = applyTick(answers, 'recent_surgery_detail', 'knee, March', FIELDS);
  answers = applyTick(answers, 'recent_surgery', false, FIELDS);

  assert.equal(answers.recent_surgery_detail, undefined);
});
