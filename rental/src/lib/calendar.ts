import 'server-only';
import type { BlockReason, Prisma as PrismaTypes } from '@prisma/client';
import { prisma, isOverlapError, type Tx } from './db';
import { HttpError } from './guard';
import { toStayDate, toDateKey, dateKeyRange, addDays, type DateKey } from './datetime';

/**
 * The calendar is the only writer of occupancy.
 *
 * Nothing else in this codebase decides whether dates are free. A reservation
 * blocks dates by owning a CalendarSpan; so does an owner block, a cleaning
 * block and an imported Airbnb stay. The exclusion constraint in the migration
 * enforces the rest.
 */

/** Reservation states that hold their dates. An INQUIRY does not. */
export const OCCUPYING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
] as const;

export class DatesTakenError extends HttpError {
  constructor(message = 'Those dates have just been taken. Please pick another window.') {
    super(409, message);
  }
}

/**
 * Holds dates for a reservation.
 *
 * Note what this does NOT do: check first. A check-then-write races — two
 * guests read "free" a millisecond apart and both write. This writes and
 * catches, which cannot race, because the second INSERT blocks on the first
 * one's index entry and then fails.
 */
export async function holdForReservation(
  tx: Tx,
  args: { propertyId: string; reservationId: string; checkIn: Date; checkOut: Date },
): Promise<void> {
  try {
    await tx.calendarSpan.create({
      data: {
        propertyId: args.propertyId,
        kind: 'RESERVATION',
        checkIn: args.checkIn,
        checkOut: args.checkOut,
        reservationId: args.reservationId,
      },
    });
  } catch (err) {
    if (isOverlapError(err)) throw new DatesTakenError();
    throw err;
  }
}

export async function holdForBlock(
  tx: Tx,
  args: { propertyId: string; blockId: string; startDate: Date; endDate: Date },
): Promise<void> {
  try {
    await tx.calendarSpan.create({
      data: {
        propertyId: args.propertyId,
        kind: 'BLOCK',
        checkIn: args.startDate,
        checkOut: args.endDate,
        blockId: args.blockId,
      },
    });
  } catch (err) {
    if (isOverlapError(err)) {
      throw new DatesTakenError('Those dates are already taken by a stay or another block.');
    }
    throw err;
  }
}

/** Releases dates. Called on cancellation, no-show, hold expiry and deletion. */
export async function releaseReservation(tx: Tx, reservationId: string): Promise<void> {
  await tx.calendarSpan.deleteMany({ where: { reservationId } });
}

export async function releaseBlock(tx: Tx, blockId: string): Promise<void> {
  await tx.calendarSpan.deleteMany({ where: { blockId } });
}

/**
 * Moves a reservation's dates. Delete then insert inside one transaction: if
 * the new window collides the whole thing rolls back and the reservation keeps
 * the dates it had. There is no instant in which it holds neither.
 */
export async function moveReservation(
  tx: Tx,
  args: { reservationId: string; propertyId: string; checkIn: Date; checkOut: Date },
): Promise<void> {
  await tx.calendarSpan.deleteMany({ where: { reservationId: args.reservationId } });
  await holdForReservation(tx, args);
}

// ---------------------------------------------------------------------------
// Reading availability
// ---------------------------------------------------------------------------

/**
 * Property ids with nothing held in [checkIn, checkOut).
 *
 * The overlap test is the same half-open logic as the constraint: a span
 * overlaps the window when it starts before the window ends AND ends after the
 * window starts. Equality at either edge is a clean handover, not a clash.
 */
export async function availablePropertyIds(
  checkIn: Date,
  checkOut: Date,
  candidateIds?: string[],
): Promise<Set<string>> {
  const taken = await prisma.calendarSpan.findMany({
    where: {
      ...(candidateIds ? { propertyId: { in: candidateIds } } : {}),
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { propertyId: true },
    distinct: ['propertyId'],
  });
  const busy = new Set(taken.map((t) => t.propertyId));

  const all =
    candidateIds ??
    (await prisma.property.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map(
      (p) => p.id,
    );

  return new Set(all.filter((id) => !busy.has(id)));
}

export async function isAvailable(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  ignoreReservationId?: string,
): Promise<boolean> {
  const clash = await prisma.calendarSpan.findFirst({
    where: {
      propertyId,
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
      ...(ignoreReservationId ? { NOT: { reservationId: ignoreReservationId } } : {}),
    },
    select: { id: true },
  });
  return !clash;
}

export type DayState =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'OCCUPIED'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'OWNER'
  | 'UNAVAILABLE'
  | 'EXTERNAL';

export type CalendarDay = {
  key: DateKey;
  state: DayState;
  /** Set on the first night of whatever holds the date. */
  label?: string;
  reservationId?: string;
  blockId?: string;
  isStart: boolean;
  isEnd: boolean;
};

const BLOCK_STATE: Record<BlockReason, DayState> = {
  CLEANING: 'CLEANING',
  MAINTENANCE: 'MAINTENANCE',
  OWNER: 'OWNER',
  UNAVAILABLE: 'UNAVAILABLE',
  EXTERNAL: 'EXTERNAL',
};

/**
 * Day-by-day state for a set of properties over a window — what the master
 * calendar and the public availability grid both render.
 *
 * A checkout date is not occupied: the departing guest's span ends there, and
 * a new guest may arrive the same afternoon. Painting it as busy is how a
 * calendar loses a night a month to nobody.
 */
export async function calendarGrid(
  propertyIds: string[],
  fromKey: DateKey,
  toKey: DateKey,
): Promise<Map<string, CalendarDay[]>> {
  const from = toStayDate(fromKey);
  const to = toStayDate(addDays(toKey, 1));

  const spans = await prisma.calendarSpan.findMany({
    where: {
      propertyId: { in: propertyIds },
      checkIn: { lt: to },
      checkOut: { gt: from },
    },
    include: {
      reservation: {
        select: {
          id: true,
          reference: true,
          status: true,
          source: true,
          guest: { select: { firstName: true, lastName: true } },
        },
      },
      block: { select: { id: true, reason: true, title: true } },
    },
  });

  const keys = dateKeyRange(fromKey, toKey);
  const out = new Map<string, CalendarDay[]>();
  for (const id of propertyIds) {
    out.set(
      id,
      keys.map((key) => ({ key, state: 'AVAILABLE' as DayState, isStart: false, isEnd: false })),
    );
  }

  for (const span of spans) {
    const row = out.get(span.propertyId);
    if (!row) continue;

    const startKey = toDateKey(span.checkIn);
    const endKey = toDateKey(span.checkOut); // exclusive — not a held night

    let state: DayState = 'RESERVED';
    let label = '';
    if (span.kind === 'BLOCK' && span.block) {
      state = BLOCK_STATE[span.block.reason];
      label = span.block.title || span.block.reason;
    } else if (span.reservation) {
      state = span.reservation.status === 'CHECKED_IN' ? 'OCCUPIED' : 'RESERVED';
      const g = span.reservation.guest;
      label = `${g.firstName} ${g.lastName}`.trim() || span.reservation.reference;
    }

    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell.key < startKey || cell.key >= endKey) continue;
      cell.state = state;
      cell.reservationId = span.reservationId ?? undefined;
      cell.blockId = span.blockId ?? undefined;
      cell.isStart = cell.key === startKey;
      cell.isEnd = cell.key === addDays(endKey, -1);
      if (cell.isStart || i === 0) cell.label = label;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export async function createBlock(args: {
  propertyId: string;
  reason: BlockReason;
  title?: string;
  notes?: string;
  startKey: DateKey;
  endKey: DateKey;
  createdById?: string | null;
}): Promise<{ id: string }> {
  const startDate = toStayDate(args.startKey);
  const endDate = toStayDate(args.endKey);
  if (endDate <= startDate) throw new HttpError(400, 'The block must end after it starts.');

  return prisma.$transaction(async (tx) => {
    const block = await tx.calendarBlock.create({
      data: {
        propertyId: args.propertyId,
        reason: args.reason,
        title: args.title ?? '',
        notes: args.notes ?? '',
        startDate,
        endDate,
        createdById: args.createdById ?? null,
      },
    });
    await holdForBlock(tx, {
      propertyId: args.propertyId,
      blockId: block.id,
      startDate,
      endDate,
    });
    return { id: block.id };
  });
}

export async function deleteBlock(blockId: string): Promise<void> {
  // The span cascades with the block, but deleting it explicitly keeps the
  // ordering obvious to anyone reading this later.
  await prisma.$transaction(async (tx) => {
    await releaseBlock(tx, blockId);
    await tx.calendarBlock.delete({ where: { id: blockId } });
  });
}

/**
 * Which reservations stand in the way of taking these dates off sale. Used by
 * emergency maintenance, which must never silently evict a paying guest.
 */
export async function conflictingReservations(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
): Promise<{ id: string; reference: string; checkIn: Date; checkOut: Date; guestName: string }[]> {
  const spans = await prisma.calendarSpan.findMany({
    where: {
      propertyId,
      kind: 'RESERVATION',
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    include: {
      reservation: {
        select: {
          id: true,
          reference: true,
          checkIn: true,
          checkOut: true,
          guest: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  return spans
    .filter((s) => s.reservation)
    .map((s) => ({
      id: s.reservation!.id,
      reference: s.reservation!.reference,
      checkIn: s.reservation!.checkIn,
      checkOut: s.reservation!.checkOut,
      guestName: `${s.reservation!.guest.firstName} ${s.reservation!.guest.lastName}`.trim(),
    }));
}

/** The next confirmed arrival at a property after `after` — a cleaning deadline. */
export async function nextArrival(
  propertyId: string,
  after: Date,
): Promise<{ checkIn: Date; reference: string } | null> {
  const next = await prisma.reservation.findFirst({
    where: {
      propertyId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      checkIn: { gte: after },
    },
    orderBy: { checkIn: 'asc' },
    select: { checkIn: true, reference: true },
  });
  return next;
}

export type PrismaClientLike = PrismaTypes.TransactionClient;
