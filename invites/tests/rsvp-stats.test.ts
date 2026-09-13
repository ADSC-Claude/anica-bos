import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsvpStats, wholeShares, dietaryNeeds, type StatReply } from '../src/lib/rsvp-stats';

/**
 * The RSVP tab's numbers: the tiles, the bars, the meal and dietary chips
 * and the messages, all read off the replies the way the rest of the account
 * reads them.
 */
const reply = (over: Partial<StatReply> = {}): StatReply => ({
  response: 'ACCEPT',
  seats: 1,
  seatsApproved: null,
  mealChoice: '',
  dietary: '',
  message: '',
  name: 'Ana Santos',
  ...over,
});

test('nothing yet is all noughts, and nothing divides by nothing', () => {
  const s = rsvpStats([], 0);
  assert.equal(s.responses, 0);
  assert.equal(s.accepted, 0);
  assert.equal(s.attending, 0);
  assert.equal(s.notAttending, 0);
  assert.equal(s.averageParty, 0);
  assert.deepEqual(s.breakdown.map((b) => [b.key, b.count, b.pct]), [['attending', 0, 0], ['declined', 0, 0], ['pending', 0, 0]]);
  assert.deepEqual(s.meals, []);
  assert.equal(s.toldDietary, 0);
  assert.deepEqual(s.dietary, []);
  assert.deepEqual(s.messages, []);
});

test('the tiles: replies, seats confirmed, regrets, and the average party', () => {
  const s = rsvpStats([reply({ seats: 2 }), reply({ seats: 3 }), reply({ seats: 4 }), reply({ response: 'DECLINE', seats: 4 })], 0);
  assert.equal(s.responses, 4);
  assert.equal(s.accepted, 3);
  assert.equal(s.attending, 9, 'a regret holds no seats, whatever number rode along');
  assert.equal(s.notAttending, 1);
  assert.equal(s.averageParty, 3, 'seats over the replies that said yes');
});

test('the average is to one decimal, over the yeses only', () => {
  assert.equal(rsvpStats([reply({ seats: 1 }), reply({ seats: 2 })], 0).averageParty, 1.5);
  assert.equal(rsvpStats([reply({ seats: 1 }), reply({ seats: 1 }), reply({ seats: 2 })], 0).averageParty, 1.3, '4 over 3, cut to a decimal');
  assert.equal(rsvpStats([reply({ seats: 1 }), reply({ response: 'DECLINE' }), reply({ response: 'DECLINE' })], 0).averageParty, 1, 'the regrets are not in the divisor');
  assert.equal(rsvpStats([reply({ response: 'DECLINE' })], 0).averageParty, 0, 'nobody to average');
});

test('a number the couple settled overrides the one the guest put down', () => {
  const s = rsvpStats([reply({ seats: 5, seatsApproved: 2 }), reply({ seats: 3, seatsApproved: 3 }), reply({ seats: 2 })], 0);
  assert.equal(s.attending, 7, '2 settled, 3 kept, 2 unvetted');
  assert.equal(s.averageParty, 2.3);
  // and a meal is counted at the settled number too
  const m = rsvpStats([reply({ seats: 6, seatsApproved: 2, mealChoice: 'Chicken' })], 0);
  assert.deepEqual(m.meals, [{ label: 'Chicken', count: 2 }]);
});

test('the bars share out a hundred between yes, no and silent', () => {
  const s = rsvpStats([reply(), reply(), reply({ response: 'DECLINE' })], 1);
  assert.deepEqual(s.breakdown.map((b) => [b.key, b.label, b.count, b.pct]), [
    ['attending', 'Attending', 2, 50],
    ['declined', 'Not attending', 1, 25],
    ['pending', 'No reply yet', 1, 25],
  ]);
  // only the silent, before anybody has written
  const quiet = rsvpStats([], 5);
  assert.deepEqual(quiet.breakdown.map((b) => b.pct), [0, 0, 100]);
  assert.equal(quiet.responses, 0);
  // a negative pending is somebody else's arithmetic error, and reads as none
  assert.equal(rsvpStats([reply()], -3).breakdown[2].count, 0);
});

test('percentages always add to 100, whatever the rounding wants', () => {
  assert.deepEqual(wholeShares([1, 1, 1]), [34, 33, 33], 'the point left over goes to the first of a tie');
  assert.deepEqual(wholeShares([1, 2, 4]), [14, 29, 57], '28.57 lost the most in the cut');
  assert.deepEqual(wholeShares([2, 1, 0]), [67, 33, 0]);
  assert.deepEqual(wholeShares([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(wholeShares([3]), [100]);
  for (const counts of [[1, 1, 1], [1, 2, 4], [7, 11, 13], [1, 1, 1, 1, 1, 1, 1], [99, 1, 0]]) {
    const total = counts.reduce((a, b) => a + b, 0);
    const shares = wholeShares(counts);
    assert.equal(shares.reduce((a, b) => a + b, 0), 100, `${counts.join(',')} adds up`);
    shares.forEach((p, i) => assert.ok(Math.abs(p - (counts[i] * 100) / total) < 1, 'never more than a point off the true share'));
  }
  // the page reads it through the stats: three of three
  const s = rsvpStats([reply(), reply({ response: 'DECLINE' })], 1);
  assert.equal(s.breakdown.reduce((sum, b) => sum + b.pct, 0), 100);
});

test('meals are counted by seat, like the headcount sheet, most picked first', () => {
  const s = rsvpStats(
    [
      reply({ seats: 1, mealChoice: 'Fish' }),
      reply({ seats: 4, mealChoice: 'Chicken' }),
      reply({ seats: 2, mealChoice: ' Fish ' }),
      reply({ seats: 3, mealChoice: '' }),
      reply({ response: 'DECLINE', seats: 2, mealChoice: 'Beef' }),
    ],
    0,
  );
  assert.deepEqual(s.meals, [{ label: 'Chicken', count: 4 }, { label: 'Fish', count: 3 }], 'no meal, no chip; a regret cooks nothing');
  // a reply settled at nought still eats: the sheet counts it as one, so this does too
  assert.deepEqual(rsvpStats([reply({ seats: 3, seatsApproved: 0, mealChoice: 'Beef' })], 0).meals, [{ label: 'Beef', count: 1 }]);
});

test('dietary notes are split into needs and grouped whatever the spelling', () => {
  assert.deepEqual(dietaryNeeds(['no pork, shellfish allergy', 'Shellfish allergy / no pork.', 'NUTS\nno   pork; nuts']), [
    { label: 'No pork', count: 3 },
    { label: 'Shellfish allergy', count: 2 },
    { label: 'NUTS', count: 1 },
  ]);
  assert.deepEqual(dietaryNeeds(['', '  ', ',,']), [], 'blank notes say nothing');
  assert.deepEqual(dietaryNeeds(['nuts, nuts, Nuts']), [{ label: 'Nuts', count: 1 }], 'one guest is one guest, however often they say it');
  assert.deepEqual(dietaryNeeds(['halal']), [{ label: 'Halal', count: 1 }], 'shown with a capital');
});

test('the dietary card counts who told you, among the yeses', () => {
  const s = rsvpStats(
    [reply({ dietary: 'no pork' }), reply({ dietary: '  ' }), reply({ dietary: 'nuts' }), reply({ response: 'DECLINE', dietary: 'vegan' })],
    0,
  );
  assert.equal(s.toldDietary, 2);
  assert.equal(s.accepted, 3);
  assert.deepEqual(s.dietary, [{ label: 'No pork', count: 1 }, { label: 'Nuts', count: 1 }], 'a regret is not asked');
});

test('messages keep their order, drop the blank ones, and sign with the name', () => {
  const s = rsvpStats(
    [
      reply({ name: 'Ana', message: 'See you there!' }),
      reply({ name: 'Ben', message: '   ' }),
      reply({ name: 'Cora', response: 'DECLINE', message: ' Sorry we cannot make it. ' }),
      reply({ name: '  ', message: 'Congrats' }),
    ],
    0,
  );
  assert.deepEqual(s.messages, [
    { name: 'Ana', message: 'See you there!' },
    { name: 'Cora', message: 'Sorry we cannot make it.' },
    { name: 'A guest', message: 'Congrats' },
  ]);
});
