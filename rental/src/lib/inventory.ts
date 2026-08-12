import 'server-only';
import type { MovementKind } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';
import { toDateKey, toStayDate } from './datetime';
import { audit } from './audit';
import type { SessionUser } from './auth';

/**
 * Stock and linen.
 *
 * The rule that keeps this honest: `InventoryItem.stockQty` is a cache of the
 * signed sum of its movements, and every write goes through `recordMovement`
 * so the two cannot drift. `scripts/verify-integrity.ts` re-derives the sum and
 * fails if it disagrees, which is how a bug here gets found rather than
 * believed.
 *
 * Linen is counted by state rather than by ledger sum, because a towel does not
 * stop existing when it is dirty — it moves. `moveLinen` is the only writer,
 * and it refuses to move more than the source state holds.
 */

export const LINEN_STATES = ['clean', 'inUse', 'dirty', 'atLaundry', 'damaged', 'missing'] as const;
export type LinenState = (typeof LINEN_STATES)[number];

const LINEN_COLUMN: Record<LinenState, 'cleanQty' | 'inUseQty' | 'dirtyQty' | 'atLaundryQty' | 'damagedQty' | 'missingQty'> = {
  clean: 'cleanQty',
  inUse: 'inUseQty',
  dirty: 'dirtyQty',
  atLaundry: 'atLaundryQty',
  damaged: 'damagedQty',
  missing: 'missingQty',
};

export const LINEN_LABELS: Record<LinenState, string> = {
  clean: 'Clean',
  inUse: 'In use',
  dirty: 'Dirty',
  atLaundry: 'At laundry',
  damaged: 'Damaged',
  missing: 'Missing',
};

/**
 * The single writer of stock. `quantity` is signed the way the ledger reads it:
 * a purchase is positive, usage negative. An adjustment is whatever the count
 * says, which is the only way a physical recount can ever be reconciled.
 */
export async function recordMovement(args: {
  itemId: string;
  kind: MovementKind;
  quantity: number;
  note?: string;
  expenseId?: string | null;
  user: SessionUser;
}): Promise<void> {
  if (!Number.isFinite(args.quantity) || args.quantity === 0) {
    throw new HttpError(400, 'A movement needs a non-zero quantity.');
  }

  const item = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: args.itemId },
    select: { id: true, name: true, propertyId: true, stockQty: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.create({
      data: {
        itemId: args.itemId,
        kind: args.kind,
        quantity: args.quantity,
        note: args.note ?? '',
        expenseId: args.expenseId ?? null,
        createdById: args.user.id,
      },
    });
    await tx.inventoryItem.update({
      where: { id: args.itemId },
      data: { stockQty: { increment: args.quantity } },
    });
  });

  await audit(args.user, {
    module: 'inventory',
    action: args.kind.toLowerCase(),
    entityType: 'InventoryItem',
    entityId: args.itemId,
    propertyId: item.propertyId,
    summary: `${item.name}: ${args.quantity > 0 ? '+' : ''}${args.quantity}`,
    before: { stockQty: item.stockQty },
    after: { stockQty: item.stockQty + args.quantity },
  });
}

/**
 * A purchase that also books the money. One action, because a restock that
 * updates stock but not the books is how a P&L quietly stops being true.
 */
export async function recordPurchase(args: {
  itemId: string;
  quantity: number;
  amountCents: number;
  vendorId?: string | null;
  note?: string;
  user: SessionUser;
}): Promise<{ expenseId: string | null }> {
  if (args.quantity <= 0) throw new HttpError(400, 'A purchase must be a positive quantity.');

  const item = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: args.itemId },
    include: { property: { select: { id: true, name: true, branchId: true } } },
  });

  let expenseId: string | null = null;
  if (args.amountCents > 0) {
    const category = await prisma.expenseCategory.findFirst({
      where: { name: 'Supplies' },
      select: { id: true },
    });
    if (category) {
      const expense = await prisma.expense.create({
        data: {
          propertyId: item.propertyId,
          branchId: item.property.branchId,
          categoryId: category.id,
          date: toStayDate(toDateKey(new Date())),
          amountCents: args.amountCents,
          vendorId: args.vendorId ?? item.vendorId,
          description: `${args.quantity} × ${item.name}`,
          createdById: args.user.id,
        },
      });
      expenseId = expense.id;
    }
  }

  await recordMovement({
    itemId: args.itemId,
    kind: 'PURCHASE',
    quantity: args.quantity,
    note: args.note ?? 'Purchase',
    expenseId,
    user: args.user,
  });

  return { expenseId };
}

/** Sets stock to a counted figure by writing the difference, never the total. */
export async function recount(args: {
  itemId: string;
  countedQty: number;
  note?: string;
  user: SessionUser;
}): Promise<void> {
  const item = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id: args.itemId },
    select: { stockQty: true },
  });
  const delta = args.countedQty - item.stockQty;
  if (delta === 0) return;

  await recordMovement({
    itemId: args.itemId,
    kind: 'ADJUSTMENT',
    quantity: delta,
    note: args.note || `Recount: ${item.stockQty} → ${args.countedQty}`,
    user: args.user,
  });
}

/** Moves linen between states, refusing to move more than the source holds. */
export async function moveLinen(args: {
  linenItemId: string;
  from: LinenState;
  to: LinenState;
  quantity: number;
  note?: string;
  user: SessionUser;
}): Promise<void> {
  if (args.quantity <= 0) throw new HttpError(400, 'Move a positive quantity.');
  if (args.from === args.to) throw new HttpError(400, 'Choose two different states.');

  const item = await prisma.linenItem.findUniqueOrThrow({ where: { id: args.linenItemId } });
  const fromCol = LINEN_COLUMN[args.from];
  const toCol = LINEN_COLUMN[args.to];

  const available = item[fromCol];
  if (available < args.quantity) {
    throw new HttpError(
      400,
      `Only ${available} ${item.name} are ${LINEN_LABELS[args.from].toLowerCase()}.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.linenItem.update({
      where: { id: args.linenItemId },
      data: { [fromCol]: { decrement: args.quantity }, [toCol]: { increment: args.quantity } },
    });
    await tx.linenMovement.create({
      data: {
        linenItemId: args.linenItemId,
        fromState: args.from,
        toState: args.to,
        quantity: args.quantity,
        note: args.note ?? '',
      },
    });
  });

  await audit(args.user, {
    module: 'inventory',
    action: 'linen.move',
    entityType: 'LinenItem',
    entityId: args.linenItemId,
    propertyId: item.propertyId,
    summary: `${args.quantity} × ${item.name}: ${LINEN_LABELS[args.from]} → ${LINEN_LABELS[args.to]}`,
  });
}

export function linenTotal(item: {
  cleanQty: number;
  inUseQty: number;
  dirtyQty: number;
  atLaundryQty: number;
  damagedQty: number;
  missingQty: number;
}): number {
  return (
    item.cleanQty + item.inUseQty + item.dirtyQty + item.atLaundryQty + item.damagedQty + item.missingQty
  );
}
