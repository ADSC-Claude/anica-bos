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
 *
 * These build their own questions rather than reading the spa's catalogue: a
 * fresh database has had the migrations run and nothing seeded, and a test
 * that quietly depends on seed data passes on a laptop and fails in CI.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const k = (name: string) => `t_${name}_${stamp}`;

before(async () => {
  const make = (
    name: string,
    type: 'BOOLEAN' | 'TEXT',
    extra: Record<string, unknown> = {},
  ) =>
    prisma.clientFieldDefinition.create({
      data: {
        key: k(name), label: name, section: 'MEDICAL', type,
        showOnline: true, sortRank: 900, ...extra,
      },
    });

  await make('surgery', 'BOOLEAN', { alertValues: ['true'] });
  await make('surgery_detail', 'TEXT', { dependsOnKey: k('surgery') });
  await make('meds', 'BOOLEAN', { alertValues: ['true'] });
  await make('meds_detail', 'TEXT', { dependsOnKey: k('meds') });
  await make('none', 'BOOLEAN', { isNoneOption: true });
});

after(async () => {
  await prisma.clientFieldDefinition.deleteMany({ where: { key: { endsWith: stamp } } });
  await prisma.$disconnect();
});

const byKey = (name: string) =>
  prisma.clientFieldDefinition.findUnique({ where: { key: k(name) } });

// -------------------------------------------------------- the stored shape

test('a follow-up hangs off the question it elaborates', async () => {
  const detail = await byKey('surgery_detail');
  assert.ok(detail);
  assert.equal(detail.dependsOnKey, k('surgery'));
  assert.ok(detail.showOnline, 'and is asked of guests booking online, not just at the desk');
});

test('the question it hangs off is a tick box', async () => {
  // A follow-up on a free-text parent would never appear, because there is
  // nothing to tick, and nobody would notice until a therapist needed it.
  const parent = await byKey('surgery');
  assert.equal(parent?.type, 'BOOLEAN');
});

test('a follow-up is never itself a parent', async () => {
  // One level only. A chain would leave an answer on screen underneath a
  // question that is itself hidden.
  const detail = await byKey('surgery_detail');
  const parent = await prisma.clientFieldDefinition.findUnique({
    where: { key: detail!.dependsOnKey! },
  });
  assert.equal(parent?.dependsOnKey, null);
});

test('"none of the above" is a tick, and never hidden behind another answer', async () => {
  const none = await byKey('none');
  assert.ok(none);
  assert.equal(none.type, 'BOOLEAN');
  assert.equal(none.dependsOnKey, null);
  assert.equal(none.alertValues.length, 0, 'answering "nothing applies" is not an alert');
});

test('nothing in the catalogue depends on a question that does not exist', async () => {
  // Whatever the spa has configured, every reveal must have something to
  // reveal from — including the rows the migration inserted.
  const followUps = await prisma.clientFieldDefinition.findMany({
    where: { dependsOnKey: { not: null }, retired: false },
  });
  const keys = new Set(
    (await prisma.clientFieldDefinition.findMany({ select: { key: true } })).map((f) => f.key),
  );
  const orphans = followUps
    .filter((f) => !keys.has(f.dependsOnKey!))
    .map((f) => `${f.key} → ${f.dependsOnKey}`);
  assert.deepEqual(orphans, [], 'a follow-up whose parent is missing can never be shown');
});

// ------------------------------------------------------------- the rules

/**
 * What the form does when a box is ticked, kept here so it can be checked
 * without a browser. Mirrors `setMedical` in the booking form.
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
