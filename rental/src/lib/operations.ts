import 'server-only';
import type { Priority, TaskKind, TaskStatus } from '@prisma/client';
import { prisma, type Tx } from './db';
import { HttpError } from './errors';
import { getSettings } from './settings';
import { releaseBlock } from './calendar';
import { notify, resolveNotification } from './notifications';
import { countdown, toDateKey, toStayDate } from './datetime';

/**
 * Turnover, tasks and the READY gate.
 *
 * `Task` is the board spine: assignment, deadline, priority and board status
 * are the same four questions for a clean, an inspection, a restock and a
 * repair, so they live once. What differs lives in the detail table with a
 * unique taskId.
 *
 * The cost of that is two rows describing one job. `syncTask()` below is the
 * ONLY writer of Task.status for a task that has a detail row — nothing else
 * may touch it, or the board and the work drift apart.
 */

// ---------------------------------------------------------------------------
// The task spine
// ---------------------------------------------------------------------------

/**
 * Deadline pressure, not importance. Under four hours to a next check-in is
 * urgent whatever else is on the board, because after that a guest arrives to
 * an unclean flat.
 */
export function priorityFor(dueAt: Date | null, urgentWithinHours: number, now = new Date()): Priority {
  if (!dueAt) return 'MEDIUM';
  const hours = (dueAt.getTime() - now.getTime()) / 3_600_000;
  if (hours <= urgentWithinHours) return 'URGENT';
  if (hours <= 24) return 'HIGH';
  if (hours <= 72) return 'MEDIUM';
  return 'LOW';
}

const CLEANING_BOARD: Record<string, TaskStatus> = {
  PENDING: 'OPEN',
  ASSIGNED: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  INSPECTION: 'IN_PROGRESS',
  COMPLETED: 'DONE',
  CANCELLED: 'CANCELLED',
};

const INSPECTION_BOARD: Record<string, TaskStatus> = {
  PENDING: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  PASSED: 'DONE',
  NEEDS_ATTENTION: 'BLOCKED',
  FAILED: 'BLOCKED',
};

const MAINTENANCE_BOARD: Record<string, TaskStatus> = {
  REPORTED: 'OPEN',
  ASSIGNED: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_PARTS: 'BLOCKED',
  COMPLETED: 'DONE',
  CANCELLED: 'CANCELLED',
};

/**
 * Pushes a detail row's state onto its board row. The single point where the
 * two can go wrong, which is why it is one function and under test.
 */
export async function syncTask(tx: Tx, taskId: string): Promise<void> {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: {
      cleaning: { select: { status: true, assigneeId: true, nextCheckInAt: true } },
      inspection: { select: { status: true, inspectorId: true } },
      ticket: { select: { status: true, assigneeId: true, priority: true } },
    },
  });
  if (!task) return;

  const settings = await getSettings();
  let status: TaskStatus = task.status;
  let assigneeId = task.assigneeId;
  let priority: Priority = task.priority;
  let dueAt = task.dueAt;

  if (task.cleaning) {
    status = CLEANING_BOARD[task.cleaning.status] ?? task.status;
    assigneeId = task.cleaning.assigneeId;
    dueAt = task.cleaning.nextCheckInAt ?? task.dueAt;
    priority = priorityFor(dueAt, settings['ops.urgentWithinHours']);
  } else if (task.inspection) {
    status = INSPECTION_BOARD[task.inspection.status] ?? task.status;
    assigneeId = task.inspection.inspectorId;
    priority = priorityFor(dueAt, settings['ops.urgentWithinHours']);
  } else if (task.ticket) {
    status = MAINTENANCE_BOARD[task.ticket.status] ?? task.status;
    assigneeId = task.ticket.assigneeId;
    priority = task.ticket.priority;
  }

  await tx.task.update({
    where: { id: taskId },
    data: {
      status,
      assigneeId,
      priority,
      dueAt,
      completedAt: status === 'DONE' ? (task.completedAt ?? new Date()) : null,
    },
  });
}

export async function createTask(
  tx: Tx,
  args: {
    propertyId: string;
    kind: TaskKind;
    title: string;
    notes?: string;
    assigneeId?: string | null;
    dueAt?: Date | null;
    priority?: Priority;
    reservationId?: string | null;
    createdById?: string | null;
  },
) {
  return tx.task.create({
    data: {
      propertyId: args.propertyId,
      kind: args.kind,
      title: args.title,
      notes: args.notes ?? '',
      assigneeId: args.assigneeId ?? null,
      dueAt: args.dueAt ?? null,
      priority: args.priority ?? 'MEDIUM',
      reservationId: args.reservationId ?? null,
      createdById: args.createdById ?? null,
    },
  });
}

/** Cancels open work attached to a reservation that is no longer happening. */
export async function cancelTasksFor(tx: Tx, reservationId: string): Promise<void> {
  const tasks = await tx.task.findMany({
    where: { reservationId, status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } },
    select: { id: true },
  });
  const ids = tasks.map((t) => t.id);
  if (!ids.length) return;

  await tx.cleaningTask.updateMany({ where: { taskId: { in: ids } }, data: { status: 'CANCELLED' } });
  await tx.task.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED' } });
}

// ---------------------------------------------------------------------------
// Turnover
// ---------------------------------------------------------------------------

/**
 * Checkout opens the turnover. Called inside the checkout transaction so a
 * vacated unit is on someone's phone immediately, not after the next cron.
 *
 * The deadline is the next confirmed arrival. Without one it is
 * `ops.defaultCleaningHours` after checkout, and the dates are blocked so the
 * unit is not sold as ready while it is still dirty. With a same-day arrival
 * there is nothing to block — the incoming guest already owns that date.
 */
export async function openTurnover(
  tx: Tx,
  args: {
    propertyId: string;
    reservationId: string | null;
    checkoutAt: Date;
    nextCheckInAt: Date | null;
  },
): Promise<{ taskId: string; cleaningId: string }> {
  const settings = await getSettings();
  const property = await tx.property.findUniqueOrThrow({
    where: { id: args.propertyId },
    select: { name: true },
  });

  const deadline =
    args.nextCheckInAt ??
    new Date(args.checkoutAt.getTime() + settings['ops.defaultCleaningHours'] * 3_600_000);

  const template = await tx.checklistTemplate.findFirst({
    where: { active: true, OR: [{ propertyId: args.propertyId }, { propertyId: null }] },
    // A property's own template wins over the default. `nulls: 'last'` is the
    // whole of that sentence: Postgres sorts NULLs FIRST on DESC, so without it
    // the default template — the one row with a null propertyId — comes back
    // every time and a property's own checklist is silently never used.
    orderBy: { propertyId: { sort: 'desc', nulls: 'last' } },
  });

  // One active cleaner in the whole business is the common case at this size,
  // and making her tap "accept" on work only she can do is friction for its own
  // sake. More than one and a human decides.
  const cleaners = await tx.user.findMany({ where: { role: 'CLEANER', active: true }, select: { id: true } });
  const assigneeId = cleaners.length === 1 ? cleaners[0].id : null;

  const task = await tx.task.create({
    data: {
      propertyId: args.propertyId,
      kind: 'CLEANING',
      title: `Turnover — ${property.name}`,
      reservationId: args.reservationId,
      assigneeId,
      dueAt: deadline,
      priority: priorityFor(deadline, settings['ops.urgentWithinHours']),
      status: 'OPEN',
    },
  });

  const cleaning = await tx.cleaningTask.create({
    data: {
      taskId: task.id,
      propertyId: args.propertyId,
      reservationId: args.reservationId,
      templateId: template?.id ?? null,
      status: assigneeId ? 'ASSIGNED' : 'PENDING',
      assigneeId,
      checkoutAt: args.checkoutAt,
      nextCheckInAt: args.nextCheckInAt,
    },
  });

  if (template) {
    const items = await tx.checklistItem.findMany({ where: { templateId: template.id } });
    if (items.length) {
      await tx.checklistResult.createMany({
        data: items.map((i) => ({ cleaningTaskId: cleaning.id, itemId: i.id })),
      });
    }
  }

  await tx.property.update({ where: { id: args.propertyId }, data: { readyState: 'CLEANING' } });

  return { taskId: task.id, cleaningId: cleaning.id };
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

/** Ticks or unticks one item. Saved per item, so a dropped signal costs nothing. */
export async function setChecklistItem(args: {
  cleaningTaskId: string;
  itemId: string;
  done: boolean;
  note?: string;
  photoUrl?: string;
}): Promise<void> {
  const item = await prisma.checklistItem.findUniqueOrThrow({ where: { id: args.itemId } });
  if (args.done && item.requiresPhoto && !args.photoUrl) {
    const existing = await prisma.checklistResult.findUnique({
      where: { cleaningTaskId_itemId: { cleaningTaskId: args.cleaningTaskId, itemId: args.itemId } },
      select: { photoUrl: true },
    });
    if (!existing?.photoUrl) throw new HttpError(400, `"${item.label}" needs a photo.`);
  }

  await prisma.checklistResult.upsert({
    where: { cleaningTaskId_itemId: { cleaningTaskId: args.cleaningTaskId, itemId: args.itemId } },
    create: {
      cleaningTaskId: args.cleaningTaskId,
      itemId: args.itemId,
      done: args.done,
      note: args.note ?? '',
      photoUrl: args.photoUrl ?? '',
      doneAt: args.done ? new Date() : null,
    },
    update: {
      done: args.done,
      ...(args.note !== undefined ? { note: args.note } : {}),
      ...(args.photoUrl ? { photoUrl: args.photoUrl } : {}),
      doneAt: args.done ? new Date() : null,
    },
  });

  await prisma.cleaningTask.updateMany({
    where: { id: args.cleaningTaskId, status: { in: ['PENDING', 'ASSIGNED'] } },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });

  const cleaning = await prisma.cleaningTask.findUniqueOrThrow({
    where: { id: args.cleaningTaskId },
    select: { taskId: true },
  });
  await prisma.$transaction(async (tx) => syncTask(tx, cleaning.taskId));
}

/** What still stands between this clean and inspection. */
export async function outstandingItems(cleaningTaskId: string): Promise<string[]> {
  const results = await prisma.checklistResult.findMany({
    where: { cleaningTaskId },
    include: { item: true },
  });
  const problems: string[] = [];
  for (const r of results) {
    if (r.item.mandatory && !r.done) problems.push(`${r.item.label} is not done`);
    else if (r.done && r.item.requiresPhoto && !r.photoUrl) problems.push(`${r.item.label} needs a photo`);
  }
  return problems;
}

/**
 * Finishes a clean and hands it to inspection.
 *
 * Restock quantities move stock here, linked to this task, so "where did the
 * coffee go" has an answer with a date and a name on it.
 */
export async function submitForInspection(args: {
  cleaningTaskId: string;
  restocks?: { itemId: string; quantity: number }[];
  notes?: string;
  userId?: string | null;
}): Promise<void> {
  const problems = await outstandingItems(args.cleaningTaskId);
  if (problems.length) {
    throw new HttpError(400, `Not finished yet: ${problems.slice(0, 3).join('; ')}.`);
  }

  const cleaning = await prisma.cleaningTask.findUniqueOrThrow({
    where: { id: args.cleaningTaskId },
    include: { property: { select: { id: true, name: true, branchId: true } } },
  });

  await prisma.$transaction(async (tx) => {
    for (const r of args.restocks ?? []) {
      if (r.quantity <= 0) continue;
      await tx.cleaningRestock.upsert({
        where: { cleaningTaskId_itemId: { cleaningTaskId: args.cleaningTaskId, itemId: r.itemId } },
        create: { cleaningTaskId: args.cleaningTaskId, itemId: r.itemId, quantity: r.quantity },
        update: { quantity: r.quantity },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: r.itemId,
          kind: 'USAGE',
          quantity: -r.quantity,
          note: `Restocked during turnover`,
          cleaningTaskId: args.cleaningTaskId,
          createdById: args.userId ?? null,
        },
      });
      await tx.inventoryItem.update({
        where: { id: r.itemId },
        data: { stockQty: { decrement: r.quantity } },
      });
    }

    await tx.cleaningTask.update({
      where: { id: args.cleaningTaskId },
      data: { status: 'INSPECTION', completedAt: new Date(), notes: args.notes ?? cleaning.notes },
    });

    // The inspection is its own task so it can be assigned to a different
    // person and appear on their board, not buried inside the clean.
    const inspectors = await tx.user.findMany({
      where: { role: 'INSPECTOR', active: true },
      select: { id: true },
    });

    const task = await tx.task.create({
      data: {
        propertyId: cleaning.propertyId,
        kind: 'INSPECTION',
        title: `Inspect — ${cleaning.property.name}`,
        reservationId: cleaning.reservationId,
        assigneeId: inspectors.length === 1 ? inspectors[0].id : null,
        dueAt: cleaning.nextCheckInAt,
        priority: 'HIGH',
      },
    });
    await tx.inspection.create({
      data: {
        taskId: task.id,
        propertyId: cleaning.propertyId,
        cleaningTaskId: cleaning.id,
        inspectorId: inspectors.length === 1 ? inspectors[0].id : null,
      },
    });

    await syncTask(tx, cleaning.taskId);
  });

  await prisma.property.update({
    where: { id: cleaning.propertyId },
    data: { readyState: 'INSPECTION' },
  });
}

// ---------------------------------------------------------------------------
// Inspection and the READY gate
// ---------------------------------------------------------------------------

export async function recordInspection(args: {
  inspectionId: string;
  areas: { area: string; verdict: 'PASS' | 'NEEDS_ATTENTION' | 'FAIL'; note?: string; photoUrl?: string }[];
  notes?: string;
  inspectorId?: string | null;
}): Promise<{ status: 'PASSED' | 'NEEDS_ATTENTION' | 'FAILED' }> {
  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: args.inspectionId },
    include: {
      property: { select: { id: true, name: true, branchId: true } },
      cleaning: { select: { id: true, taskId: true, blockId: true, nextCheckInAt: true } },
    },
  });

  // The whole is the worst of its parts: one failed area fails the inspection,
  // because a unit is not half ready.
  const worst = args.areas.some((a) => a.verdict === 'FAIL')
    ? 'FAILED'
    : args.areas.some((a) => a.verdict === 'NEEDS_ATTENTION')
      ? 'NEEDS_ATTENTION'
      : 'PASSED';

  await prisma.$transaction(async (tx) => {
    await tx.inspectionArea.deleteMany({ where: { inspectionId: args.inspectionId } });
    await tx.inspectionArea.createMany({
      data: args.areas.map((a) => ({
        inspectionId: args.inspectionId,
        area: a.area,
        verdict: a.verdict,
        note: a.note ?? '',
        photoUrl: a.photoUrl ?? '',
      })),
    });

    await tx.inspection.update({
      where: { id: args.inspectionId },
      data: {
        status: worst,
        notes: args.notes ?? '',
        inspectorId: args.inspectorId ?? inspection.inspectorId,
        completedAt: new Date(),
      },
    });

    if (worst === 'PASSED') {
      await tx.cleaningTask.updateMany({
        where: { id: inspection.cleaningTaskId ?? '' },
        data: { status: 'COMPLETED' },
      });
      if (inspection.cleaning?.blockId) {
        await releaseBlock(tx, inspection.cleaning.blockId);
        await tx.calendarBlock.delete({ where: { id: inspection.cleaning.blockId } });
      }
    } else {
      // Back to the cleaner with the notes attached. The unit stays off READY.
      await tx.cleaningTask.updateMany({
        where: { id: inspection.cleaningTaskId ?? '' },
        data: { status: 'IN_PROGRESS', completedAt: null },
      });
    }

    await syncTask(tx, inspection.taskId);
    if (inspection.cleaning) await syncTask(tx, inspection.cleaning.taskId);
  });

  await syncReadyState(inspection.propertyId);

  if (worst !== 'PASSED') {
    await notify({
      kind: 'UNIT_NOT_READY',
      severity: worst === 'FAILED' ? 'URGENT' : 'HIGH',
      title: `${inspection.property.name} did not pass inspection`,
      body: args.areas
        .filter((a) => a.verdict !== 'PASS')
        .map((a) => `${a.area}: ${a.note || a.verdict}`)
        .join(' · '),
      link: `/portal/tasks/${inspection.taskId}`,
      dedupeKey: `inspection-failed:${inspection.id}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId: inspection.propertyId,
    });
  } else {
    await resolveNotification(`inspection-failed:${inspection.id}`);
  }

  return { status: worst };
}

/**
 * The READY gate, and the truth behind `Property.readyState`.
 *
 * A property is ready when it has no open cleaning and no inspection that has
 * not passed. This predicate is what the dashboard and the arrivals list ask;
 * the column is a cache of it. If the two ever disagree, this is right.
 */
export async function isReady(propertyId: string): Promise<boolean> {
  const [openClean, openInspection] = await Promise.all([
    prisma.cleaningTask.count({
      where: { propertyId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION'] } },
    }),
    prisma.inspection.count({
      where: { propertyId, status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_ATTENTION', 'FAILED'] } },
    }),
  ]);
  return openClean === 0 && openInspection === 0;
}

export async function syncReadyState(propertyId: string): Promise<void> {
  const [cleaning, inspecting, blocked] = await Promise.all([
    prisma.cleaningTask.count({
      where: { propertyId, status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } },
    }),
    prisma.inspection.count({
      where: { propertyId, status: { in: ['PENDING', 'IN_PROGRESS', 'NEEDS_ATTENTION', 'FAILED'] } },
    }),
    prisma.maintenanceTicket.count({
      where: { propertyId, priority: 'URGENT', status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),
  ]);

  const readyState = blocked > 0 ? 'BLOCKED' : cleaning > 0 ? 'CLEANING' : inspecting > 0 ? 'INSPECTION' : 'READY';
  await prisma.property.update({ where: { id: propertyId }, data: { readyState } });
}

/**
 * Units with a guest arriving soon that are not ready. The one alert an owner
 * genuinely needs before it happens rather than after.
 */
export async function unreadyArrivals(now = new Date()) {
  const settings = await getSettings();
  const horizon = new Date(now.getTime() + settings['ops.alertUnreadyWithinHours'] * 3_600_000);

  const arrivals = await prisma.reservation.findMany({
    where: {
      status: 'CONFIRMED',
      checkIn: { gte: toStayDate(toDateKey(now)), lte: toStayDate(toDateKey(horizon)) },
    },
    include: { property: { select: { id: true, name: true, checkInMinute: true, branchId: true } } },
  });

  const out: { reservationId: string; reference: string; propertyName: string; propertyId: string; when: Date; branchId: string }[] = [];
  for (const a of arrivals) {
    if (await isReady(a.propertyId)) continue;
    out.push({
      reservationId: a.id,
      reference: a.reference,
      propertyName: a.property.name,
      propertyId: a.propertyId,
      when: new Date(a.checkIn.getTime() + a.property.checkInMinute * 60_000 - 8 * 3_600_000),
      branchId: a.property.branchId,
    });
  }
  return out;
}

/** Cleans past their deadline. Drives the overdue alert and the red cards. */
export async function overdueCleanings(now = new Date()) {
  return prisma.cleaningTask.findMany({
    where: {
      status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
      nextCheckInAt: { lt: now },
    },
    include: {
      property: { select: { id: true, name: true, branchId: true } },
      task: { select: { id: true } },
      assignee: { select: { name: true } },
    },
  });
}

export function deadlineLabel(dueAt: Date | null, now = new Date()): string {
  if (!dueAt) return 'No deadline';
  return countdown(dueAt, now);
}
