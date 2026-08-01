/**
 * The owner's three rules for a visit of more than one treatment.
 *
 *   "if the services is both in the same bed, or in the same chair services,
 *    this setup doesnt need complication and can push through with just 5mins
 *    interval just to prepare for the next service, but if add ons, no need
 *    for 5mins interval."
 *
 * Three separate claims, and each one is a test below:
 *
 *  1. Two bed treatments in a row are one bed, held throughout. She lies down
 *     once. Offering her Bed 3 and then Bed 7 would be asking her to get up
 *     and walk across the floor between her massage and her ear candling.
 *  2. There is still five minutes between them — linen, oils, a moment for the
 *     therapist. It is real floor time even though nobody moves.
 *  3. An add-on is not a second treatment. No gap before it, and it happens
 *     wherever the treatment it extends happened.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gapBetween,
  houseOrder,
  placeRuns,
  planVisit,
  visitMinutes,
  type Treatment,
} from '../src/lib/itinerary';

/** 1:30pm Manila. */
const AT = new Date('2027-03-04T05:30:00Z');
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila',
  }).format(d);

const HOUSE = 5;

const massage: Treatment = {
  serviceId: 'swedish', name: 'Swedish Massage', durationMinutes: 60,
  sequenceRank: 30, placeType: 'BED',
};
const earCandling: Treatment = {
  serviceId: 'ear', name: 'Ear Candling', durationMinutes: 30,
  sequenceRank: 30, placeType: 'BED',
};
const compress: Treatment = {
  serviceId: 'compress', name: 'Hot Compress Add-on', durationMinutes: 15,
  sequenceRank: 50, placeType: 'BED', isAddOn: true,
};
const sauna: Treatment = {
  serviceId: 'sauna', name: 'Sauna Session', durationMinutes: 30,
  sequenceRank: 10, placeType: 'SAUNA',
};
const footSpa: Treatment = {
  serviceId: 'foot', name: 'Foot Spa', durationMinutes: 45,
  sequenceRank: 20, placeType: 'CHAIR',
};

// --------------------------------------------------------------- same place

test('a massage then ear candling is one bed, held right through', () => {
  const runs = placeRuns(
    planVisit({ treatments: [massage, earCandling], startAt: AT, changeoverMinutes: HOUSE }),
  );

  assert.equal(runs.length, 1, 'she lies down once, so there is one hold');
  assert.equal(runs[0].placeType, 'BED');
  assert.equal(hhmm(runs[0].startAt), '13:30');
  // 60 + 5 + 30: the bed is hers across the gap in the middle too. Releasing it
  // for those five minutes would let a stranger book the bed she is lying on.
  assert.equal(hhmm(runs[0].endAt), '15:05');
  assert.equal(runs[0].segments.length, 2);
});

test('the five minutes between them is still real', () => {
  const [first] = planVisit({
    treatments: [massage, earCandling], startAt: AT, changeoverMinutes: HOUSE,
  });
  assert.equal(first.changeoverAfter, 5);
  assert.equal(visitMinutes([massage, earCandling], HOUSE), 60 + 5 + 30);
});

test('two chair treatments behave the same way', () => {
  const runs = placeRuns(
    planVisit({
      treatments: [footSpa, { ...footSpa, serviceId: 'foot2', name: 'Foot Massage' }],
      startAt: AT,
      changeoverMinutes: HOUSE,
    }),
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].placeType, 'CHAIR');
});

// ------------------------------------------------------------------ add-ons

test('an add-on starts the moment the treatment before it ends', () => {
  const [first, second] = planVisit({
    treatments: [massage, compress], startAt: AT, changeoverMinutes: HOUSE,
  });
  assert.equal(first.changeoverAfter, 0, 'no turnover: she has not got up');
  assert.equal(hhmm(second.startAt), '14:30');
  assert.equal(hhmm(first.endAt), '14:30');
});

test('an add-on costs the visit nothing but its own minutes', () => {
  assert.equal(visitMinutes([massage, compress], HOUSE), 75);
  assert.equal(visitMinutes([massage, earCandling], HOUSE), 95);
});

test('an add-on never becomes a hold of its own', () => {
  const runs = placeRuns(
    planVisit({ treatments: [massage, compress], startAt: AT, changeoverMinutes: HOUSE }),
  );
  assert.equal(runs.length, 1);
  assert.equal(hhmm(runs[0].endAt), '14:45');
});

test('an add-on stays with its treatment when the house reorders the visit', () => {
  // Filed at the default rank of 50, a hot compress would sort *after* a
  // massage at 30 — and also after the sauna at 10, stranding it at the end of
  // the visit away from the treatment it belongs to.
  const order = houseOrder([compress, massage, sauna]);
  assert.deepEqual(
    order.map((t) => t.serviceId),
    ['sauna', 'swedish', 'compress'],
  );
});

test('an add-on with nothing in front of it is simply a treatment', () => {
  const runs = placeRuns(planVisit({ treatments: [compress], startAt: AT, changeoverMinutes: HOUSE }));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].placeType, 'BED');
});

// --------------------------------------------------------- changing places

test('changing the kind of place starts a new hold', () => {
  const runs = placeRuns(
    planVisit({ treatments: [sauna, massage], startAt: AT, changeoverMinutes: HOUSE }),
  );
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => r.placeType), ['SAUNA', 'BED']);
  // The sauna is given back at 2:00 rather than held until she leaves at 3:05.
  assert.equal(hhmm(runs[0].endAt), '14:00');
  assert.equal(hhmm(runs[1].startAt), '14:05');
  assert.equal(hhmm(runs[1].endAt), '15:05');
});

test('going back to the same kind of place is a second, separate hold', () => {
  // Bed, sauna, bed: she leaves the first bed and it can be sold to somebody
  // else while she is in the heat. Merging these would hold a bed for an hour
  // nobody is on it.
  const runs = placeRuns(
    planVisit({
      treatments: [massage, sauna, earCandling],
      startAt: AT,
      changeoverMinutes: HOUSE,
    }),
  );
  assert.equal(runs.length, 3);
  assert.deepEqual(runs.map((r) => r.placeType), ['BED', 'SAUNA', 'BED']);
});

test('gapBetween is the one place the rule lives', () => {
  assert.equal(gapBetween(massage, earCandling, HOUSE), 5);
  assert.equal(gapBetween(massage, compress, HOUSE), 0);
  assert.equal(gapBetween(massage, undefined, HOUSE), 0, 'nothing follows the last one');
  // A treatment carrying its own changeover keeps it — a sauna needs a shower.
  assert.equal(gapBetween({ ...sauna, changeoverMinutes: 20 }, massage, HOUSE), 20);
});
