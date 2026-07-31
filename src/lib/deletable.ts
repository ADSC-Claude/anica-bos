import { prisma } from './db';
import type { Permission } from './rbac';

/**
 * Deleting a record you added by mistake, without being able to delete one the
 * books depend on.
 *
 * Financial records are not here at all and never will be: sales, receipts,
 * journals, payslips and stock movements are void-only, because a gapless
 * receipt series with a hole in it reads to an examiner as a hidden
 * transaction, not as a corrected mistake.
 *
 * What *is* here still cannot be deleted once history points at it — a receipt
 * has to keep saying what was sold, and a payslip has to keep saying who was
 * paid. Each entry below lists what blocks the delete, so the refusal can name
 * the obstacle instead of surfacing a foreign-key error. Where the record can
 * sensibly be kept but hidden, `deactivate` describes the fallback offered
 * instead.
 *
 * Deliberately free of `server-only`, like pos.ts, so the tests can drive the
 * guards directly — the point of this module is that its refusals are checked,
 * not assumed.
 */

type Blocker = {
  /** Human phrase used in the refusal, e.g. "3 past sales". */
  label: (n: number) => string;
  count: (id: string) => Promise<number>;
};

type Entity = {
  /** Shown in the confirmation and the audit entry. */
  noun: string;
  permission: Permission;
  module: string;
  name: (id: string) => Promise<string | null>;
  blockers: Blocker[];
  /** Offered when a blocker stops the delete. */
  deactivate?: { verb: string; run: (id: string) => Promise<void> };
  /** Rows that exist only to configure this record; they go with it. */
  cascade?: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const DELETABLE = {
  service: {
    noun: 'service',
    permission: 'settings.edit',
    module: 'settings',
    name: async (id) =>
      (await prisma.service.findUnique({ where: { id }, select: { name: true } }))?.name ?? null,
    blockers: [
      {
        label: (n) => `${plural(n, 'line on a past sale')}`,
        count: (id) => prisma.saleLine.count({ where: { serviceId: id } }),
      },
      {
        label: (n) => `${plural(n, 'appointment')}`,
        count: (id) => prisma.appointmentService.count({ where: { serviceId: id } }),
      },
      {
        label: (n) => `${plural(n, 'package')}`,
        count: (id) => prisma.packageItem.count({ where: { serviceId: id } }),
      },
    ],
    deactivate: {
      verb: 'Deactivate it instead — it disappears from the POS, the booking page and the price list, and stays on past records.',
      run: async (id) => {
        await prisma.service.update({
          where: { id },
          data: { active: false, showOnLanding: false },
        });
      },
    },
    cascade: async (id) => {
      await prisma.serviceRecipe.deleteMany({ where: { serviceId: id } });
      await prisma.employeeSkill.deleteMany({ where: { serviceId: id } });
      await prisma.employeeCommissionRule.deleteMany({ where: { serviceId: id } });
    },
    remove: async (id) => {
      await prisma.service.delete({ where: { id } });
    },
  },

  serviceCategory: {
    noun: 'service category',
    permission: 'settings.edit',
    module: 'settings',
    name: async (id) =>
      (await prisma.serviceCategory.findUnique({ where: { id }, select: { name: true } }))?.name ??
      null,
    blockers: [
      // Only the primary category counts. Nothing else points at a category:
      // sale lines reference the service, and reach the category through it,
      // so a category with no services of its own is not holding up history.
      {
        label: (n) => `${plural(n, 'service')}`,
        count: (id) => prisma.service.count({ where: { categoryId: id } }),
      },
    ],
    deactivate: {
      verb: 'Hide it instead — the heading leaves the price list and the booking form, and its services stay where they are.',
      run: async (id) => {
        await prisma.serviceCategory.update({ where: { id }, data: { active: false } });
      },
    },
    // "Also list under" is display-only by design, so a service pointing here
    // as a second heading is configuration rather than history: the extra
    // heading goes with the category, and the service itself is untouched.
    cascade: async (id) => {
      await prisma.serviceCategory.update({ where: { id }, data: { alsoListed: { set: [] } } });
    },
    remove: async (id) => {
      await prisma.serviceCategory.delete({ where: { id } });
    },
  },

  client: {
    noun: 'client',
    permission: 'clients.edit',
    module: 'clients',
    name: async (id) =>
      (await prisma.client.findUnique({ where: { id }, select: { name: true } }))?.name ?? null,
    blockers: [
      {
        label: (n) => `${plural(n, 'sale')}`,
        count: (id) => prisma.sale.count({ where: { clientId: id } }),
      },
      {
        label: (n) => `${plural(n, 'appointment')}`,
        count: (id) => prisma.appointment.count({ where: { clientId: id } }),
      },
      {
        label: (n) => `${plural(n, 'gift certificate')}`,
        count: (id) => prisma.giftCertificate.count({ where: { buyerClientId: id } }),
      },
    ],
    // No hiding a client: one with no visits is a duplicate or a typo, and one
    // with visits cannot be deleted anyway. Merge is the tool for duplicates
    // that do have history.
    cascade: async (id) => {
      await prisma.clientFieldValue.deleteMany({ where: { clientId: id } });
      await prisma.clientFeedback.deleteMany({ where: { clientId: id } });
      await prisma.clientFollowUp.deleteMany({ where: { clientId: id } });
      await prisma.clientPackage.deleteMany({ where: { clientId: id } });
      await prisma.loyaltyTransaction.deleteMany({ where: { clientId: id } });
      await prisma.corporateAccountClient.deleteMany({ where: { clientId: id } });
      await prisma.emailLog.deleteMany({ where: { clientId: id } });
    },
    remove: async (id) => {
      await prisma.client.delete({ where: { id } });
    },
  },

  employee: {
    noun: 'employee',
    permission: 'employees.edit',
    module: 'employees',
    name: async (id) =>
      (await prisma.employee.findUnique({ where: { id }, select: { name: true } }))?.name ?? null,
    blockers: [
      {
        label: (n) => `${plural(n, 'line on a past sale')}`,
        count: (id) => prisma.saleLine.count({ where: { employeeId: id } }),
      },
      {
        label: (n) => `${plural(n, 'payslip')}`,
        count: (id) => prisma.payslip.count({ where: { employeeId: id } }),
      },
      {
        label: (n) => `${plural(n, 'commission record')}`,
        count: (id) => prisma.commission.count({ where: { employeeId: id } }),
      },
      {
        label: (n) => `${plural(n, 'attendance record')}`,
        count: (id) => prisma.attendance.count({ where: { employeeId: id } }),
      },
      {
        label: (n) => `${plural(n, 'booked appointment')}`,
        count: (id) => prisma.appointmentService.count({ where: { employeeId: id } }),
      },
      {
        label: (n) => `${plural(n, 'loan')}`,
        count: (id) => prisma.employeeLoan.count({ where: { employeeId: id } }),
      },
    ],
    deactivate: {
      verb: 'Mark them separated instead — they leave the roster and the POS, and their payroll history is kept.',
      run: async (id) => {
        // Both fields, always: `active` alone would leave a SEPARATED employee
        // reading as ACTIVE, which is the one pair the rest of the system
        // cannot interpret. Set a date here too, so the separated list is not
        // showing a blank last day.
        await prisma.employee.update({
          where: { id },
          data: { active: false, status: 'SEPARATED', separatedAt: new Date() },
        });
      },
    },
    cascade: async (id) => {
      await prisma.employeeSkill.deleteMany({ where: { employeeId: id } });
      await prisma.employeeSchedule.deleteMany({ where: { employeeId: id } });
      await prisma.employeeCommissionRule.deleteMany({ where: { employeeId: id } });
      await prisma.permit.deleteMany({ where: { employeeId: id } });
    },
    remove: async (id) => {
      await prisma.employee.delete({ where: { id } });
    },
  },

  item: {
    noun: 'inventory item',
    permission: 'inventory.edit',
    module: 'inventory',
    name: async (id) =>
      (await prisma.item.findUnique({ where: { id }, select: { name: true } }))?.name ?? null,
    blockers: [
      {
        label: (n) => `${plural(n, 'stock movement')}`,
        count: (id) => prisma.stockMovement.count({ where: { itemId: id } }),
      },
      {
        label: (n) => `${plural(n, 'line on a past sale')}`,
        count: (id) => prisma.saleLine.count({ where: { itemId: id } }),
      },
      {
        label: (n) => `${plural(n, 'purchase order line')}`,
        count: (id) => prisma.purchaseOrderLine.count({ where: { itemId: id } }),
      },
      {
        label: (n) => `${plural(n, 'stock take line')}`,
        count: (id) => prisma.stockTakeLine.count({ where: { itemId: id } }),
      },
      {
        label: (n) => `${plural(n, "service's consumption recipe", "services' consumption recipes")}`,
        count: (id) => prisma.serviceRecipe.count({ where: { itemId: id } }),
      },
    ],
    deactivate: {
      verb: 'Archive it instead — it leaves the stock list and the POS, and its movement history is kept.',
      run: async (id) => {
        await prisma.item.update({ where: { id }, data: { archived: true } });
      },
    },
    cascade: async (id) => {
      await prisma.supplierItem.deleteMany({ where: { itemId: id } });
    },
    remove: async (id) => {
      await prisma.item.delete({ where: { id } });
    },
  },

} satisfies Record<string, Entity>;

export type DeletableKind = keyof typeof DELETABLE;

export type DeleteCheck =
  | { deletable: true; noun: string; name: string }
  | { deletable: false; noun: string; name: string; blockedBy: string[]; deactivate?: string };

/** What is standing in the way, if anything. Read-only — changes nothing. */
export async function checkDeletable(
  kind: DeletableKind,
  id: string,
): Promise<DeleteCheck | null> {
  const entity = DELETABLE[kind] as Entity;
  const name = await entity.name(id);
  if (name === null) return null;

  const counts = await Promise.all(entity.blockers.map((b) => b.count(id)));
  const blockedBy = entity.blockers
    .map((b, i) => (counts[i] > 0 ? b.label(counts[i]) : null))
    .filter((s): s is string => s !== null);

  if (blockedBy.length === 0) return { deletable: true, noun: entity.noun, name };
  return { deletable: false, noun: entity.noun, name, blockedBy, deactivate: entity.deactivate?.verb };
}
