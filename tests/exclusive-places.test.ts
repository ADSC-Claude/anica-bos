/**
 * Two kinds of place, and the rules that separate them.
 *
 * A row of open beds is *shared*: two strangers lie on Bed 1 and Bed 2 all
 * evening, which is the point of having four beds rather than one room of four.
 * A couples room and the sauna are *exclusive*: one party takes the whole
 * thing, and it is gone to everyone else however many places are free inside.
 *
 * That single distinction carries two of the owner's rules at once — a room
 * cannot be sold to one person (it would strand the other bed), and nobody
 * joins strangers in the sauna.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { availableResources, assertNoConflicts } from '../src/lib/availability';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

let branchId: string;
let roomId: string; // exclusive, holds 2
let saunaId: string; // exclusive, holds 4
let bedId: string; // shared, holds 1
let chairsId: string; // shared, holds 2
let clientId: string;

const AT = new Date('2027-05-01T05:00:00Z');
const UNTIL = new Date('2027-05-01T06:00:00Z');

const OURS = `party-${stamp}-a`;
const THEIRS = `party-${stamp}-b`;

const ids = async (rs: { id: string }[]) => rs.map((r) => r.id);

function book(resourceId: string, partyRef: string) {
  return prisma.appointment.create({
    data: {
      branchId,
      reference: `EXC-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      resourceId,
      partyRef,
      startAt: AT,
      endAt: UNTIL,
      status: 'CONFIRMED',
    },
  });
}

before(async () => {
  const branch = await prisma.branch.create({
    data: { name: `exc-${stamp}`, code: `EXC${stamp}`.slice(0, 10), address: '', contact: '' },
  });
  branchId = branch.id;

  const mk = async (
    name: string,
    type: 'ROOM' | 'BED' | 'CHAIR' | 'SAUNA',
    capacity: number,
    exclusiveUse: boolean,
    rank: number,
    fillWhole = false,
  ) =>
    (
      await prisma.resource.create({
        data: {
          branchId, name: `${name} ${stamp}`, type, capacity, exclusiveUse, fillWhole,
          sortRank: rank,
        },
      })
    ).id;

  // The room is exclusive *and* must be filled; the sauna is exclusive only.
  // That is the whole distinction these tests exist to hold in place.
  roomId = await mk('Room', 'ROOM', 2, true, 1, true);
  bedId = await mk('Bed', 'BED', 1, false, 2);
  chairsId = await mk('Chairs', 'CHAIR', 2, false, 3);
  saunaId = await mk('Sauna', 'SAUNA', 4, true, 4, false);

  clientId = (
    await prisma.client.create({
      data: {
        branchId,
        name: `Exc ${stamp}`,
        mobile: `09${String(Date.now()).slice(-9)}`,
        email: `exc${stamp}@x.test`,
        addressCity: 'QC',
      },
    })
  ).id;
});

after(async () => {
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.client.deleteMany({ where: { branchId } });
  await prisma.resource.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const free = (partySize: number, partyRef?: string) =>
  availableResources({ branchId, startAt: AT, endAt: UNTIL, partySize, partyRef });

// ------------------------------------------------- a room needs a pair

test('one guest is not offered a couples room', async () => {
  const got = await ids(await free(1));
  assert.ok(!got.includes(roomId), 'a lone booking would strand the other bed');
  assert.ok(got.includes(bedId), 'an open bed is still fine for one');
});

test('two guests are offered the room', async () => {
  assert.ok((await ids(await free(2))).includes(roomId));
});

test('the guard refuses a room to a party that cannot fill it, and says why', async () => {
  await assert.rejects(
    () =>
      assertNoConflicts({
        branchId, startAt: AT, endAt: UNTIL,
        employeeIds: [], resourceId: roomId, partySize: 1, partyRef: OURS,
      }),
    (err: Error) => {
      assert.match(err.message, /takes 2/);
      assert.match(err.message, /nobody else can use/);
      return true;
    },
  );
});

test('the guard allows the room to a pair', async () => {
  await assert.doesNotReject(() =>
    assertNoConflicts({
      branchId, startAt: AT, endAt: UNTIL,
      employeeIds: [], resourceId: roomId, partySize: 2, partyRef: OURS,
    }),
  );
});

// ------------------------------- but the sauna does not, and that is not the same rule

test('one guest may book the whole sauna to herself', async () => {
  // Reported from the live site: the fourth person in a party, booked in for a
  // sauna session, was refused it with "takes 4 — a smaller booking would leave
  // a place nobody else can use". That is the couples-room rule, and it is
  // wrong here. The sauna holds four but the spa is happy to sell it to one:
  // she has it to herself, and the next booking takes it after she leaves.
  const got = await ids(await free(1));
  assert.ok(got.includes(saunaId), 'first to book gets it, however few of them there are');
});

test('the guard lets her have it too', async () => {
  await assert.doesNotReject(() =>
    assertNoConflicts({
      branchId, startAt: AT, endAt: UNTIL,
      employeeIds: [], resourceId: saunaId, partySize: 1, partyRef: OURS,
    }),
  );
});

test('the two rules are reported separately, so a picker can tell them apart', async () => {
  const all = await free(2);
  const room = all.find((r) => r.id === roomId);
  const sauna = all.find((r) => r.id === saunaId);
  assert.deepEqual(
    { excl: room?.exclusiveUse, fill: room?.fillWhole },
    { excl: true, fill: true },
  );
  assert.deepEqual(
    { excl: sauna?.exclusiveUse, fill: sauna?.fillWhole },
    { excl: true, fill: false },
  );
});

// ------------------------------------- exclusive means exclusive

test('a party already in the sauna may add its own guests', async () => {
  await book(saunaId, OURS);
  const got = await ids(await free(3, OURS));
  assert.ok(got.includes(saunaId), 'three more of ours still fit in a sauna for four');
});

test('but the sauna is gone to everyone else, with places to spare', async () => {
  const got = await ids(await free(1, THEIRS));
  assert.ok(!got.includes(saunaId), 'nobody joins strangers in a sauna');
});

test('the guard refuses the stranger too, and does not say "full"', async () => {
  await assert.rejects(
    () =>
      assertNoConflicts({
        branchId, startAt: AT, endAt: UNTIL,
        employeeIds: [], resourceId: saunaId, partySize: 1, partyRef: THEIRS,
      }),
    (err: Error) => {
      // "Full" would be a lie — three places are free. The reason is that it is
      // not shared, and the message has to say so or the desk will argue.
      assert.match(err.message, /not shared/);
      return true;
    },
  );
});

test('the sauna fills up on its own party too', async () => {
  await book(saunaId, OURS);
  await book(saunaId, OURS);
  await book(saunaId, OURS); // four in a four-person sauna
  assert.ok(!(await ids(await free(1, OURS))).includes(saunaId));
});

// ------------------------------------- shared places are unaffected

test('a shared chair area takes two unrelated bookings', async () => {
  await book(chairsId, OURS);
  const got = await free(1, THEIRS);
  const chairs = got.find((r) => r.id === chairsId);
  assert.ok(chairs, 'a stranger may take the second chair');
  assert.equal(chairs.remaining, 1);
});

test('and is full once both chairs are taken, by whoever', async () => {
  await book(chairsId, THEIRS);
  assert.ok(!(await ids(await free(1, THEIRS))).includes(chairsId));
});

test('remaining and capacity are reported, so a caller can say "1 of 2 free"', async () => {
  const bed = (await free(1)).find((r) => r.id === bedId);
  assert.equal(bed?.capacity, 1);
  assert.equal(bed?.remaining, 1);
  assert.equal(bed?.exclusiveUse, false);
});
