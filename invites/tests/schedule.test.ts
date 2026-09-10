import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleAdvice, PROCESSING_DAYS, FINAL_FORM_DAYS, COMFORTABLE_DAYS } from '../src/lib/progress';
import { fieldsFor } from '../src/lib/sections';

const day = 24 * 60 * 60 * 1000;
const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The customer names one date. Every other date we quote is counted back from it. */
test('the schedule counts back from the day they send it out', () => {
  const now = on('2026-09-10');
  const s = scheduleAdvice(on('2026-11-26'), now)!;
  assert.equal(s.sendOut.toISOString().slice(0, 10), '2026-11-26');
  // three weeks before, at the latest; a month before, by preference
  assert.equal(s.finalBy.toISOString().slice(0, 10), '2026-11-05');
  assert.equal(s.comfortableBy.toISOString().slice(0, 10), '2026-10-27');
  assert.equal(Math.round((s.sendOut.getTime() - s.finalBy.getTime()) / day), FINAL_FORM_DAYS);
  assert.equal(Math.round((s.sendOut.getTime() - s.comfortableBy.getTime()) / day), COMFORTABLE_DAYS);
  // a form final today would be built by
  assert.equal(s.readyIfFinalisedNow.toISOString().slice(0, 10), '2026-09-17');
  assert.equal(s.daysToSendOut, 77);
  assert.equal(s.tight, false);
  assert.equal(s.late, false);
});

test('tight and late are named, not hidden', () => {
  const now = on('2026-09-10');
  // four weeks out: the form is due within the week, so say so
  const tight = scheduleAdvice(on('2026-10-06'), now)!;
  assert.equal(tight.tight, true);
  assert.equal(tight.late, false);
  // inside the week of work: nothing can be promised without talking first
  const late = scheduleAdvice(on('2026-09-14'), now)!;
  assert.equal(late.late, true);
  assert.equal(late.daysToSendOut, 4);
  // exactly the processing week is still not late
  const edge = scheduleAdvice(on('2026-09-17'), now)!;
  assert.equal(edge.daysToSendOut, PROCESSING_DAYS);
  assert.equal(edge.late, false);
  // a day already past
  assert.equal(scheduleAdvice(on('2026-09-01'), now)!.late, true);
});

test('no date, no advice, and a bad date is not a crash', () => {
  assert.equal(scheduleAdvice(null), null);
  assert.equal(scheduleAdvice(undefined), null);
  assert.equal(scheduleAdvice(new Date('not a date')), null);
});

/** The customer is asked for it, and it never reaches a guest. */
test('the send-out date is asked on the cover of every occasion, and is the customer’s to fill', () => {
  for (const occ of ['WEDDING', 'CHRISTENING', 'DEBUT', 'CORPORATE'] as const) {
    const f = fieldsFor('cover', occ).find((x) => x.key === 'sendOut');
    assert.equal(f?.type, 'date', occ);
    assert.notEqual(f?.staff, true, occ);
    assert.match(String(f?.hint), /Not shown to your guests/, occ);
  }
});
