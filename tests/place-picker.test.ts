/**
 * The floor-plan picker, reconstructed from the bookings that went wrong.
 *
 * Every case below is a party of four that a real person tried to book on the
 * live site: two massages, one foot reflexology, one sauna. Three separate
 * things were wrong with it, and all three came from the same two mistakes —
 * counting the whole party as candidates for a couples room regardless of what
 * their treatments needed, and using one flag for "one booking at a time" and
 * "must be taken whole" when the sauna is the first without being the second.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotState, movableInto, blockingFill, type PickerPlace } from '../src/lib/place-picker';

const BEDS = ['ROOM', 'BED'];

const place = (over: Partial<PickerPlace> & { id: string; type: string }): PickerPlace => ({
  capacity: 1,
  exclusiveUse: false,
  fillWhole: false,
  taken: 0,
  heldByOther: false,
  ...over,
});

/** The spa's actual floor. */
const room1 = place({ id: 'r1', type: 'ROOM', capacity: 2, exclusiveUse: true, fillWhole: true });
const room2 = place({ id: 'r2', type: 'ROOM', capacity: 2, exclusiveUse: true, fillWhole: true });
const openBeds = place({ id: 'ob', type: 'BED', capacity: 4 });
const chairs = place({ id: 'ch', type: 'CHAIR', capacity: 2 });
const sauna = place({ id: 'sa', type: 'SAUNA', capacity: 4, exclusiveUse: true, fillWhole: false });
const PLAN = [room1, room2, openBeds, chairs, sauna];

/** You (massage), Jeff (body ritual), mon (reflexology), chez (sauna). */
const PARTY = [
  { accepts: BEDS },
  { accepts: BEDS },
  { accepts: ['CHAIR'] },
  { accepts: ['SAUNA'] },
];

const stateOf = (
  p: PickerPlace,
  index: number,
  seats: Record<number, string>,
  activeGuest: number,
  guests = PARTY,
) => slotState({ plan: PLAN, place: p, index, guests, seats, activeGuest });

// ------------------------------------------------------- report 1: the room
// "I am supposedly not allowed to choose room 1 when someone chose open beds
//  first, since we dont allow leaving one bed vacant for rooms 1 and 2"

test('a room is offered while two of the party can still fill it', () => {
  assert.equal(stateOf(room1, 0, {}, 0), 'free');
});

test('a room is closed once the only other bed guest is seated elsewhere', () => {
  // Jeff has taken an open bed. Of the four, only You are left who could lie in
  // Room 1 at all — mon is booked for a chair and chez for the sauna — so Room
  // 1 can no longer be filled and must not be clickable.
  const seats = { 1: 'ob' };
  assert.equal(movableInto(PARTY, seats, 0, 'ROOM'), 1);
  assert.equal(stateOf(room1, 0, seats, 0), 'needs-more');
  assert.equal(stateOf(room2, 0, seats, 0), 'needs-more');
});

test('the whole party is not the count — only those who can use the place', () => {
  // Three of four unplaced is not three candidates for a couples room. This is
  // the arithmetic that let the bad state be reached in the first place.
  assert.equal(movableInto(PARTY, {}, 0, 'ROOM'), 2);
  assert.equal(movableInto(PARTY, {}, 0, 'CHAIR'), 1);
  assert.equal(movableInto(PARTY, {}, 0, 'SAUNA'), 1);
});

test('and the reverse: with a room half taken, the open beds close', () => {
  // "vice versa when rooms 1 or 2's bed is chosen, open beds shouldnt be
  //  available" — for the guest who could finish the room, at least.
  const seats = { 0: 'r1' };
  assert.equal(stateOf(openBeds, 0, seats, 1), 'finish-room');
  assert.equal(stateOf(room2, 0, seats, 1), 'finish-room');
  assert.equal(stateOf(room1, 1, seats, 1), 'free', 'the other bed in it is the way out');
});

test('two of two is still allowed for a pair booked in together', () => {
  const pair = [{ accepts: BEDS }, { accepts: BEDS }];
  assert.equal(stateOf(room1, 0, {}, 0, pair), 'free');
  assert.equal(stateOf(room1, 1, { 0: 'r1' }, 1, pair), 'free');
});

test('one person alone is never offered a room', () => {
  const solo = [{ accepts: BEDS }];
  assert.equal(stateOf(room1, 0, {}, 0, solo), 'needs-more');
  assert.equal(stateOf(openBeds, 0, {}, 0, solo), 'free');
});

// ------------------------------------------------------ report 2: the chair
// "why the 3rd person 'mon' isnt allowed to click for the chair when the
//  service in under foot reflexology"

test('a half-filled room does not hold back a guest who could never fill it', () => {
  const seats = { 0: 'r1' };
  // mon is booked for reflexology. She cannot lie in Room 1 whatever she does,
  // so "Finish Room 1 first" left her with nothing at all to click.
  assert.equal(stateOf(chairs, 0, seats, 2), 'free');
  assert.equal(stateOf(sauna, 0, seats, 3), 'free');
  // The beds are still wrong for her, but for the honest reason.
  assert.equal(stateOf(room2, 0, seats, 2), 'wrong-type');
  assert.equal(stateOf(openBeds, 0, seats, 2), 'wrong-type');
});

test('it does hold back the guest who could', () => {
  const seats = { 0: 'r1' };
  assert.equal(blockingFill(PLAN, PARTY, seats, 1)?.id, 'r1', 'Jeff can finish it');
  assert.equal(blockingFill(PLAN, PARTY, seats, 2), null, 'mon cannot');
  assert.equal(blockingFill(PLAN, PARTY, seats, 3), null, 'nor chez');
});

test('the most specific reason wins, so a chair never reads as "finish Room 1"', () => {
  assert.equal(stateOf(chairs, 0, { 0: 'r1' }, 1), 'wrong-type');
});

// ------------------------------------------------------ report 3: the sauna
// "'chez' 4th person should be allowed to choose sauna because its the service
//  whether she is the only one. first one to book gets it"

test('one guest may take the sauna alone', () => {
  assert.equal(stateOf(sauna, 0, {}, 3), 'free');
  assert.equal(movableInto(PARTY, {}, 3, 'SAUNA'), 1, 'and she is the only one who wants it');
});

test('a sauna booked by one person is not a half-finished room', () => {
  // The must-fill rule is what stopped her, and it is a room rule. Nothing is
  // stranded by a sauna with three empty places: she has it to herself and the
  // next booking takes it after her.
  const seats = { 3: 'sa' };
  assert.equal(blockingFill(PLAN, PARTY, seats, 0), null);
  assert.equal(stateOf(openBeds, 0, seats, 0), 'free');
});

test('a solo booking for a sauna session gets it', () => {
  const solo = [{ accepts: ['SAUNA'] }];
  assert.equal(stateOf(sauna, 0, {}, 0, solo), 'free');
});

test('but a stranger already inside still takes the whole thing', () => {
  // Exclusive is untouched by any of this — it is only "must be filled" that
  // the sauna was wrongly given.
  const held = place({
    id: 'sa', type: 'SAUNA', capacity: 4, exclusiveUse: true, taken: 1, heldByOther: true,
  });
  assert.equal(
    slotState({ plan: [held], place: held, index: 1, guests: PARTY, seats: {}, activeGuest: 3 }),
    'held',
  );
});

// --------------------------------------------------------- the whole booking

test('the party of four that broke it now seats end to end', () => {
  const seats: Record<number, string> = {};
  // You take a bed in Room 1...
  assert.equal(stateOf(room1, 0, seats, 0), 'free');
  seats[0] = 'r1';
  // ...Jeff is steered into the other one rather than the open beds...
  assert.equal(stateOf(openBeds, 0, seats, 1), 'finish-room');
  assert.equal(stateOf(room1, 1, seats, 1), 'free');
  seats[1] = 'r1';
  // ...mon takes a chair, chez takes the sauna.
  assert.equal(stateOf(chairs, 0, seats, 2), 'free');
  seats[2] = 'ch';
  assert.equal(stateOf(sauna, 0, seats, 3), 'free');
  seats[3] = 'sa';
  assert.equal(blockingFill(PLAN, PARTY, seats, 0), null, 'nothing left half done');
});

test('and the same four seat fine when nobody wants a room', () => {
  const seats: Record<number, string> = {};
  assert.equal(stateOf(openBeds, 0, seats, 0), 'free');
  seats[0] = 'ob';
  // Now only Jeff could use a room, so both are closed rather than half-sold.
  assert.equal(stateOf(room1, 0, seats, 1), 'needs-more');
  assert.equal(stateOf(openBeds, 1, seats, 1), 'free');
});

// --------------------------------------- a party of three, per the owner's rule
// "if group booking of 3, it best to recommend the beds, if they will be
//  getting one room for two people, the other 1 should go in the open beds"

test('three bed guests: two share a room, the third goes to the open beds', () => {
  const three = [{ accepts: BEDS }, { accepts: BEDS }, { accepts: BEDS }];
  const seats: Record<number, string> = {};
  assert.equal(stateOf(room1, 0, seats, 0, three), 'free');
  seats[0] = 'r1';
  assert.equal(stateOf(room1, 1, seats, 1, three), 'free');
  seats[1] = 'r1';
  // The last one cannot open Room 2 on her own.
  assert.equal(stateOf(room2, 0, seats, 2, three), 'needs-more');
  assert.equal(stateOf(openBeds, 0, seats, 2, three), 'free');
});
