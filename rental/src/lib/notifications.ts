import 'server-only';
import type { NotificationKind, Role, Severity } from '@prisma/client';
import { prisma } from './db';

/**
 * Alerts for the dashboard panel.
 *
 * Two rules make this bearable to live with:
 *
 *   • Every alert carries a `dedupeKey`. Raising a key that is already open is
 *     a no-op, so a job running every 15 minutes does not produce 96 copies of
 *     the same warning.
 *   • Conditions that stop being true resolve themselves. Stock rises above
 *     minimum, the alert disappears. Nobody dismisses warnings by hand and then
 *     wonders whether the problem went away.
 *
 * And every alert carries a `link` to the record itself — never to a filtered
 * list the reader then has to search.
 */

export type NotifyInput = {
  kind: NotificationKind;
  severity?: Severity;
  title: string;
  body?: string;
  link: string;
  dedupeKey: string;
  roles: Role[];
  propertyId?: string | null;
  branchId?: string | null;
};

export async function notify(input: NotifyInput): Promise<void> {
  const existing = await prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });

  if (existing && !existing.resolvedAt) {
    // Already open. Refresh the wording — a countdown in the title goes stale —
    // but leave readAt alone so re-raising does not un-read what someone saw.
    await prisma.notification.update({
      where: { id: existing.id },
      data: { title: input.title, body: input.body ?? '', severity: input.severity ?? existing.severity },
    });
    return;
  }

  if (existing) {
    // Previously resolved, now true again: reopen the same row rather than
    // accumulating one per recurrence.
    await prisma.notification.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        body: input.body ?? '',
        severity: input.severity ?? 'INFO',
        link: input.link,
        roles: input.roles,
        propertyId: input.propertyId ?? null,
        resolvedAt: null,
        readAt: null,
        createdAt: new Date(),
      },
    });
    return;
  }

  await prisma.notification.create({
    data: {
      kind: input.kind,
      severity: input.severity ?? 'INFO',
      title: input.title,
      body: input.body ?? '',
      link: input.link,
      dedupeKey: input.dedupeKey,
      roles: input.roles,
      propertyId: input.propertyId ?? null,
      branchId: input.branchId ?? null,
    },
  });
}

/** The condition stopped being true. Safe to call when nothing is open. */
export async function resolveNotification(dedupeKey: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { dedupeKey, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

/** Resolve a family of keys, e.g. every alert about one reservation. */
export async function resolveNotificationsLike(prefix: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { dedupeKey: { startsWith: prefix }, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

const SEVERITY_ORDER: Record<Severity, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/** Open alerts this user should see, most urgent first. */
export async function openNotifications(
  role: Role,
  propertyIds: string[] | null,
  limit = 50,
) {
  const rows = await prisma.notification.findMany({
    where: {
      resolvedAt: null,
      roles: { has: role },
      ...(propertyIds
        ? { OR: [{ propertyId: null }, { propertyId: { in: propertyIds } }] }
        : {}),
    },
    include: { property: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function markRead(id: string): Promise<void> {
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
}
