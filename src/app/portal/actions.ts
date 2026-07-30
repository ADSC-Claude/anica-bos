'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { destroySession, getSession, hashPassword, verifyPassword, createSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';

export async function logoutAction() {
  const user = await getSession();
  if (user) await audit(user, { module: 'auth', action: 'logout', entityType: 'User', entityId: user.id });
  await destroySession();
  redirect('/login');
}

export type ChangePasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await getSession();
  if (!user) redirect('/login');

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (next.length < 10) return { error: 'New password must be at least 10 characters.' };
  if (next !== confirm) return { error: 'The two new passwords do not match.' };

  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row) redirect('/login');
  if (!(await verifyPassword(current, row.passwordHash))) {
    return { error: 'Your current password is incorrect.' };
  }
  if (await verifyPassword(next, row.passwordHash)) {
    return { error: 'Please choose a password you have not used here before.' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  await audit(user, {
    module: 'auth',
    action: 'change_password',
    entityType: 'User',
    entityId: user.id,
    sensitive: true,
    summary: 'Password changed by the account owner',
  });

  await createSession({ ...user, mustChangePassword: false });
  revalidatePath('/portal');
  redirect('/portal');
}

export async function markNotificationRead(id: string) {
  const user = await getSession();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { id, OR: [{ userId: user.id }, { role: user.role }] },
    data: { readAt: new Date() },
  });
  revalidatePath('/portal');
}

export async function markAllNotificationsRead() {
  const user = await getSession();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { readAt: null, resolvedAt: null, OR: [{ userId: user.id }, { role: user.role }] },
    data: { readAt: new Date() },
  });
  revalidatePath('/portal');
}
