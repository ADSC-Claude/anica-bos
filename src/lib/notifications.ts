import 'server-only';
import type { NotificationKind, Role } from '@prisma/client';
import { prisma } from './db';

type NotifyInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  /** Stable identity for the underlying condition, e.g. `low_stock:<itemId>`. */
  dedupeKey: string;
  branchId?: string | null;
  /** Target a single user, or every user holding these roles. */
  userId?: string;
  roles?: Role[];
};

/**
 * Idempotent: re-running a job that detects the same condition updates the
 * existing row rather than spamming the panel.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const targets: { userId: string | null; role: Role | null; key: string }[] = [];
  if (input.userId) {
    targets.push({ userId: input.userId, role: null, key: `${input.dedupeKey}:u:${input.userId}` });
  }
  for (const role of input.roles ?? []) {
    targets.push({ userId: null, role, key: `${input.dedupeKey}:r:${role}` });
  }
  if (targets.length === 0) return;

  for (const t of targets) {
    await prisma.notification.upsert({
      where: { dedupeKey: t.key },
      create: {
        dedupeKey: t.key,
        kind: input.kind,
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? '',
        branchId: input.branchId ?? null,
        userId: t.userId,
        role: t.role,
      },
      update: {
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? '',
        resolvedAt: null,
      },
    });
  }
}

/** Clears every notification raised for a condition that no longer holds. */
export async function resolveNotifications(dedupeKeyPrefix: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { dedupeKey: { startsWith: dedupeKeyPrefix }, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

export async function listNotifications(user: { id: string; role: Role }, limit = 40) {
  return prisma.notification.findMany({
    where: {
      resolvedAt: null,
      OR: [{ userId: user.id }, { role: user.role }],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function unreadCount(user: { id: string; role: Role }) {
  return prisma.notification.count({
    where: {
      resolvedAt: null,
      readAt: null,
      OR: [{ userId: user.id }, { role: user.role }],
    },
  });
}
