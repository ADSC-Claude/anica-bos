/**
 * The owner's worked example, and the arithmetic around it.
 *
 * "Sauna 30 mins and Massage 60 mins. If sauna go first, booked for 1:30pm...
 *  1:30 to 2pm is for sauna, but then there will be lapses in time because
 *  there consultation, soaking of feet and preparations for the therapist."
 *
 * That last clause is the whole point. Quoting the visit as finishing at 3:00
 * is the arithmetic of two treatments and none of the reality between them, and
 * a spa that books on that number is behind by the second guest of the evening.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeoverFor,
  effectiveWindow,
  houseOrder,
  planVisit,
  reflowFrom,
  visitEnd,
  visitMinutes,
  type Treatment,
} from '../src/lib/itinerary';

/** 1:30pm Manila. */
const AT = new Date('2027-03-04T05:30:00Z');
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila',
  }).format(d);

const sauna: Treatment = {
  serviceId: 'sauna', name: 'Sauna Session', durationMinutes: 30,
  changeoverMinutes: 20, sequenceRank: 10,
};
const massage: Treatment = {
  serviceId: 'massage', name: 'Swedish Massage', durationMinutes: 60,
  changeoverMinutes: null, sequenceRank: 30,
};
const footSpa: Treatment = {
  serviceId: 'foot', name: 'Foot Spa', durationMinutes: 45,
  changeoverMinutes: null, sequenceRank: 20,
};

const plan = (treatments: Treatment[], changeoverMinutes = 15) =>
  planVisit({ treatments, startAt: AT, changeoverMinutes });

const shape = (treatments: Treatment[], changeoverMinutes = 15) =>
  plan(treatments, changeoverMinutes).map((s) => `${s.name} ${hhmm(s.startAt)}–${hhmm(s.endAt)}`);

// ------------------------------------------------------------ the worked example

test('the owner’s example, with the lapses counted', () => {
  assert.deepEqual(shape([sauna, massage]), [
    'Sauna Session 13:30–14:00',
    'Swedish Massage 14:20–15:20',
  ]);
});

test('and the finish time quoted online is the honest one', () => {
  // 30 + 20 + 60. Not 90 — the twenty minutes for the shower and the setting
  // up is time the bed is not available and the guest is not gone.
  assert.equal(visitMinutes([sauna, massage], 15), 110);
  assert.equal(hhmm(visitEnd(plan([sauna, massage]), AT)), '15:20');
});

test('reversing the order gives a different schedule and a different finish', () => {
  // Massage first uses the house default gap, not the sauna's longer one.
  assert.deepEqual(shape([massage, sauna]), [
    'Swedish Massage 13:30–14:30',
    'Sauna Session 14:45–15:15',
  ]);
  assert.equal(visitMinutes([massage, sauna], 15), 105);
});

// ---------------------------------------------------------------- the gap itself

test('the last treatment carries no gap — the guest has left', () => {
  const segs = plan([sauna, massage]);
  assert.equal(segs[0].changeoverAfter, 20);
  assert.equal(segs[1].changeoverAfter, 0);
});

test('one treatment alone is just its own length', () => {
  assert.equal(visitMinutes([massage], 15), 60);
  assert.deepEqual(shape([massage]), ['Swedish Massage 13:30–14:30']);
});

test('a treatment with no override takes the house default', () => {
  assert.equal(changeoverFor(massage, 15), 15);
  assert.equal(changeoverFor(massage, 25), 25);
});

test('and one with an override ignores it', () => {
  assert.equal(changeoverFor(sauna, 15), 20);
  assert.equal(changeoverFor(sauna, 25), 20, 'the sauna needs its shower either way');
});

test('an override of zero means zero, not "unset"', () => {
  // Null is "use the default"; 0 is a real answer. Conflating them would give
  // every back-to-back treatment a gap nobody asked for.
  assert.equal(changeoverFor({ ...massage, changeoverMinutes: 0 }, 15), 0);
});

test('three treatments carry two gaps, not three', () => {
  assert.equal(visitMinutes([sauna, footSpa, massage], 15), 30 + 20 + 45 + 15 + 60);
  assert.deepEqual(shape([sauna, footSpa, massage]), [
    'Sauna Session 13:30–14:00',
    'Foot Spa 14:20–15:05',
    'Swedish Massage 15:20–16:20',
  ]);
});

// --------------------------------------------------------------- the house order

test('the house order puts the sauna first without anyone being asked', () => {
  assert.deepEqual(
    houseOrder([massage, sauna, footSpa]).map((t) => t.name),
    ['Sauna Session', 'Foot Spa', 'Swedish Massage'],
  );
});

test('treatments with the same rank keep the order they were chosen in', () => {
  const a = { ...massage, serviceId: 'a', name: 'A' };
  const b = { ...massage, serviceId: 'b', name: 'B' };
  assert.deepEqual(houseOrder([b, a]).map((t) => t.name), ['B', 'A']);
});

test('a treatment nobody has filed goes last rather than jumping the queue', () => {
  // The default rank sits above every rank the spa has assigned, so something
  // new lands at the end of the visit until someone gives it a number. Landing
  // it at the front would put an unknown treatment ahead of the sauna on the
  // strength of nobody having thought about it yet.
  const unranked: Treatment = { serviceId: 'x', name: 'New Thing', durationMinutes: 30 };
  assert.deepEqual(
    houseOrder([massage, unranked, sauna]).map((t) => t.name),
    ['Sauna Session', 'Swedish Massage', 'New Thing'],
  );
});

test('planning uses the order it is given, not the house order', () => {
  // Reordering is the guest's to do; the planner must not quietly undo it.
  assert.equal(plan([massage, sauna])[0].name, 'Swedish Massage');
});

// ------------------------------------------------------------------- overrunning

test('a sauna that runs late pushes the massage by the same amount', () => {
  const segs = plan([sauna, massage]);
  const ranLate = new Date(segs[0].endAt.getTime() + 15 * 60_000); // finished 14:15
  const after = reflowFrom(segs, 0, ranLate);
  assert.equal(hhmm(after[0].endAt), '14:15');
  assert.equal(hhmm(after[1].startAt), '14:35', 'still gets its twenty minutes');
  assert.equal(hhmm(after[1].endAt), '15:35');
});

test('the gap is preserved, not eaten to catch up', () => {
  // The shower does not get shorter because the sauna ran long.
  const segs = plan([sauna, massage]);
  const after = reflowFrom(segs, 0, new Date(segs[0].endAt.getTime() + 30 * 60_000));
  const gap = (after[1].startAt.getTime() - after[0].endAt.getTime()) / 60_000;
  assert.equal(gap, 20);
});

test('finishing early pulls the rest of the visit forward', () => {
  const segs = plan([sauna, massage]);
  const after = reflowFrom(segs, 0, new Date(segs[0].endAt.getTime() - 10 * 60_000));
  assert.equal(hhmm(after[1].startAt), '14:10');
});

test('only what comes after moves', () => {
  const segs = plan([sauna, footSpa, massage]);
  const before = hhmm(segs[0].startAt);
  const after = reflowFrom(segs, 1, new Date(segs[1].endAt.getTime() + 10 * 60_000));
  assert.equal(hhmm(after[0].startAt), before, 'the sauna already happened');
  assert.equal(hhmm(after[0].endAt), hhmm(segs[0].endAt));
  assert.equal(hhmm(after[2].startAt), '15:30');
});

test('overrunning the last treatment moves nothing', () => {
  const segs = plan([sauna, massage]);
  const after = reflowFrom(segs, 1, new Date(segs[1].endAt.getTime() + 20 * 60_000));
  assert.equal(hhmm(after[0].startAt), hhmm(segs[0].startAt));
  assert.equal(hhmm(after[1].endAt), '15:40');
});

test('an index off the end is left alone rather than throwing', () => {
  const segs = plan([sauna, massage]);
  assert.deepEqual(reflowFrom(segs, 9, AT), segs);
});

// ------------------------------------------------- what a place is really holding

const dur = 60;
const P = new Date('2027-03-04T05:00:00Z');
const P_END = new Date('2027-03-04T06:00:00Z');

test('with nothing logged, the plan is what holds the place', () => {
  const w = effectiveWindow({ startAt: P, endAt: P_END, durationMinutes: dur })!;
  assert.equal(+w.start, +P);
  assert.equal(+w.end, +P_END);
});

test('a treatment that started late holds its place late', () => {
  // The bed is not free at 2:00 because the plan said so; she got on it at 2:20.
  const late = new Date('2027-03-04T05:20:00Z');
  const w = effectiveWindow({
    startAt: P, endAt: P_END, actualStartAt: late, durationMinutes: dur,
  })!;
  assert.equal(+w.start, +late);
  assert.equal(+w.end, +new Date('2027-03-04T06:20:00Z'));
});

test('a logged finish wins over the estimate', () => {
  const w = effectiveWindow({
    startAt: P, endAt: P_END,
    actualStartAt: new Date('2027-03-04T05:20:00Z'),
    actualEndAt: new Date('2027-03-04T06:05:00Z'),
    durationMinutes: dur,
  })!;
  assert.equal(+w.end, +new Date('2027-03-04T06:05:00Z'));
});

test('a finish logged without a start still counts from the plan', () => {
  const w = effectiveWindow({
    startAt: P, endAt: P_END, actualEndAt: new Date('2027-03-04T06:30:00Z'), durationMinutes: dur,
  })!;
  assert.equal(+w.start, +P);
  assert.equal(+w.end, +new Date('2027-03-04T06:30:00Z'));
});

test('a finish typed in before the start does not invert the hold', () => {
  // Fat fingers at the desk should not produce a booking that ends before it
  // begins — every overlap test in the system assumes start <= end.
  const w = effectiveWindow({
    startAt: P, endAt: P_END,
    actualStartAt: P_END, actualEndAt: P,
    durationMinutes: dur,
  })!;
  assert.ok(w.end >= w.start);
});

test('a segment with no window at all holds nothing', () => {
  assert.equal(effectiveWindow({ startAt: null, endAt: null, durationMinutes: dur }), null);
});
