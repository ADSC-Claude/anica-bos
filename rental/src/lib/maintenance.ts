import 'server-only';
import type { MaintenanceStatus, Priority } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { ticketNumber } from './codes';
import { syncTask, syncReadyState } from './operations';
import { holdForBlock, releaseBlock } from './calendar';
import { notify, resolveNotification } from './notifications';
import { toDateKey, toStayDate } from './datetime';
import { audit } from './audit';
import type { SessionUser } from './auth';

/**
 * Maintenance tickets.
 *
 * A ticket is a Task with a detail row, like a clean and an inspection — the
 * board does not care what kind of work it is. Two things are specific to
 * repairs and live here:
 *
 *  - An urgent ticket may take dates off sale. It does so through the same
 *    exclusion constraint as everything else, so it cannot evict a paying
 *    guest: if the dates are sold, the block is refused and the ticket is
 *    still raised.
 *  - Completing a ticket with a cost writes an Expense. Nobody re-keys a repair
 *    into the books.
 */

export async function openTicket(args: {
  propertyId: string;
  category: string;
  description: string;
  priority?: Priority;
  assigneeId?: string | null;
  vendorId?: string | null;
  reservationId?: string | null;
  blockUntil?: string | null;
  user: SessionUser;
}): Promise<{ ticketId: string; taskId: string; blocked: boolean; blockRefused: boolean }> {
  const property = await prisma.property.findUniqueOrThrow({
    where: { id: args.propertyId },
    select: { name: true },
  });

  const priority = args.priority ?? 'MEDIUM';
  const number = ticketNumber(new Date().getUTCFullYear());

  const { ticketId, taskId } = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        propertyId: args.propertyId,
        kind: 'MAINTENANCE',
        title: `${args.category} — ${property.name}`,
        notes: args.description,
        assigneeId: args.assigneeId ?? null,
        priority,
        status: 'OPEN',
        reservationId: args.reservationId ?? null,
        createdById: args.user.id,
      },
    });

    const ticket = await tx.maintenanceTicket.create({
      data: {
        number,
        taskId: task.id,
        propertyId: args.propertyId,
        category: args.category,
        description: args.description,
        priority,
        status: args.assigneeId ? 'ASSIGNED' : 'REPORTED',
        reportedById: args.user.id,
        assigneeId: args.assigneeId ?? null,
        vendorId: args.vendorId ?? null,
      },
    });

    await syncTask(tx, task.id);
    return { ticketId: ticket.id, taskId: task.id };
  });

  // Blocking is a second transaction on purpose: a refused block must not undo
  // the ticket. A broken aircon is still broken whether or not we could take
  // the dates off sale, and the person reporting it needs to see it recorded.
  let blocked = false;
  let blockRefused = false;
  if (args.blockUntil) {
    try {
      await blockDatesFor(ticketId, args.blockUntil, args.user);
      blocked = true;
    } catch (err) {
      if (err instanceof HttpError) blockRefused = true;
      else throw err;
    }
  }

  await syncReadyState(args.propertyId);

  await audit(args.user, {
    module: 'maintenance',
    action: 'open',
    entityType: 'MaintenanceTicket',
    entityId: ticketId,
    propertyId: args.propertyId,
    summary: `Ticket ${number} raised: ${args.category}`,
    after: { priority, description: args.description },
  });

  if (priority === 'URGENT') {
    await notify({
      kind: 'EMERGENCY_MAINTENANCE',
      severity: 'URGENT',
      title: `Urgent repair at ${property.name}`,
      body: args.description.slice(0, 200),
      link: `/portal/maintenance/${ticketId}`,
      dedupeKey: `ticket-urgent:${ticketId}`,
      roles: ['OWNER', 'MANAGER'],
      propertyId: args.propertyId,
    });
  }

  return { ticketId, taskId, blocked, blockRefused };
}

/** Takes dates off sale for a repair. Refused if a guest already owns them. */
export async function blockDatesFor(
  ticketId: string,
  untilKey: string,
  user: SessionUser,
): Promise<void> {
  const ticket = await prisma.maintenanceTicket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { id: true, propertyId: true, number: true, blockId: true, description: true },
  });
  if (ticket.blockId) throw new HttpError(409, 'This ticket already holds a block.');

  const startKey = toDateKey(new Date());
  const start = toStayDate(startKey);
  const end = toStayDate(untilKey);
  if (end <= start) throw new HttpError(400, 'The block must end after today.');

  await prisma.$transaction(async (tx) => {
    const block = await tx.calendarBlock.create({
      data: {
        propertyId: ticket.propertyId,
        reason: 'MAINTENANCE',
        startDate: start,
        endDate: end,
        notes: `Ticket ${ticket.number}: ${ticket.description}`.slice(0, 200),
        createdById: user.id,
      },
    });
    // Throws DatesTakenError (409) if a stay owns any of it — and the whole
    // transaction unwinds, so no half-block is left behind.
    await holdForBlock(tx, {
      propertyId: ticket.propertyId,
      blockId: block.id,
      startDate: start,
      endDate: end,
    });
    await tx.maintenanceTicket.update({ where: { id: ticketId }, data: { blockId: block.id } });
  });

  await syncReadyState(ticket.propertyId);
}

export async function releaseTicketBlock(ticketId: string): Promise<void> {
  const ticket = await prisma.maintenanceTicket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { blockId: true, propertyId: true },
  });
  if (!ticket.blockId) return;

  await prisma.$transaction(async (tx) => {
    await releaseBlock(tx, ticket.blockId!);
    await tx.maintenanceTicket.update({ where: { id: ticketId }, data: { blockId: null } });
    await tx.calendarBlock.delete({ where: { id: ticket.blockId! } });
  });
  await syncReadyState(ticket.propertyId);
}

export async function updateTicket(args: {
  ticketId: string;
  status?: MaintenanceStatus;
  priority?: Priority;
  assigneeId?: string | null;
  vendorId?: string | null;
  notes?: string;
  user: SessionUser;
}): Promise<void> {
  const before = await prisma.maintenanceTicket.findUniqueOrThrow({
    where: { id: args.ticketId },
    select: { status: true, priority: true, assigneeId: true, vendorId: true, taskId: true, propertyId: true, startedAt: true },
  });

  const status = args.status ?? before.status;
  await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.update({
      where: { id: args.ticketId },
      data: {
        status,
        priority: args.priority ?? before.priority,
        assigneeId: args.assigneeId === undefined ? before.assigneeId : args.assigneeId,
        vendorId: args.vendorId === undefined ? before.vendorId : args.vendorId,
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
        startedAt:
          status === 'IN_PROGRESS' && !before.startedAt ? new Date() : before.startedAt,
      },
    });
    await syncTask(tx, before.taskId);
  });

  await syncReadyState(before.propertyId);
  await audit(args.user, {
    module: 'maintenance',
    action: 'update',
    entityType: 'MaintenanceTicket',
    entityId: args.ticketId,
    propertyId: before.propertyId,
    summary: `Ticket updated to ${status.toLowerCase().replace('_', ' ')}`,
    before,
    after: { status, priority: args.priority ?? before.priority },
  });
}

/**
 * Completes a repair. The cost becomes an expense against the property, dated
 * today, in the Maintenance category — which is the whole point of recording
 * the cost here rather than in a notebook.
 */
export async function completeTicket(args: {
  ticketId: string;
  costCents: number;
  notes?: string;
  user: SessionUser;
}): Promise<{ expenseId: string | null }> {
  const ticket = await prisma.maintenanceTicket.findUniqueOrThrow({
    where: { id: args.ticketId },
    include: { property: { select: { id: true, name: true, branchId: true } } },
  });
  if (ticket.status === 'COMPLETED') throw new HttpError(409, 'That ticket is already complete.');

  const category = await prisma.expenseCategory.findFirst({
    where: { name: 'Maintenance' },
    select: { id: true },
  });

  let expenseId: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.update({
      where: { id: args.ticketId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        costCents: args.costCents,
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
      },
    });
    await syncTask(tx, ticket.taskId);

    if (args.costCents > 0 && category) {
      const expense = await tx.expense.create({
        data: {
          propertyId: ticket.propertyId,
          branchId: ticket.property.branchId,
          categoryId: category.id,
          date: toStayDate(toDateKey(new Date())),
          amountCents: args.costCents,
          vendorId: ticket.vendorId,
          description: `Ticket ${ticket.number}: ${ticket.description}`.slice(0, 200),
          ticketId: ticket.id,
          createdById: args.user.id,
        },
      });
      expenseId = expense.id;
    }

    if (ticket.blockId) {
      await releaseBlock(tx, ticket.blockId);
      await tx.maintenanceTicket.update({ where: { id: args.ticketId }, data: { blockId: null } });
      await tx.calendarBlock.delete({ where: { id: ticket.blockId } });
    }
  });

  await syncReadyState(ticket.propertyId);
  await resolveNotification(`ticket-urgent:${args.ticketId}`);

  await audit(args.user, {
    module: 'maintenance',
    action: 'complete',
    entityType: 'MaintenanceTicket',
    entityId: args.ticketId,
    propertyId: ticket.propertyId,
    summary: `Ticket ${ticket.number} completed${args.costCents > 0 ? ' with a cost booked to expenses' : ''}`,
    after: { costCents: args.costCents, expenseId },
  });

  return { expenseId };
}
