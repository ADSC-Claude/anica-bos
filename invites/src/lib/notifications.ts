import 'server-only';
import { prisma } from './db';
import { can, type Permission } from './rbac';

/** An in-app notice on someone's dashboard. Email is sent separately. */
export async function notify(userId: string, title: string, body = '', href = ''): Promise<void> {
  await prisma.notification.create({ data: { userId, title, body, href } });
}

/** Every active staff member holding a permission gets the same notice. */
export async function notifyStaff(permission: Permission, title: string, body = '', href = ''): Promise<number> {
  const staff = await prisma.user.findMany({
    where: { active: true, role: { in: ['ADMIN', 'ENCODER', 'SUPPORT'] } },
    select: { id: true, role: true },
  });
  const targets = staff.filter((u) => can(u.role, permission));
  if (targets.length === 0) return 0;
  await prisma.notification.createMany({ data: targets.map((u) => ({ userId: u.id, title, body, href })) });
  return targets.length;
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
