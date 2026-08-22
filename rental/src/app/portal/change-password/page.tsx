import { redirect } from 'next/navigation';
import { requireSessionPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword, createSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { home } from '@/lib/guard';
import { PageHeader, Notice } from '@/components/ui';

export const metadata = { title: 'Change password' };

async function changePassword(formData: FormData) {
  'use server';
  const user = await requireSessionPage();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  if (!(await verifyPassword(current, row.passwordHash))) {
    redirect('/portal/change-password?error=' + encodeURIComponent('That is not your current password.'));
  }
  if (next.length < 10) {
    redirect('/portal/change-password?error=' + encodeURIComponent('Use at least 10 characters.'));
  }
  if (next !== confirm) {
    redirect('/portal/change-password?error=' + encodeURIComponent('The two new passwords do not match.'));
  }
  if (next === current) {
    redirect('/portal/change-password?error=' + encodeURIComponent('Please choose a different password.'));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  // Re-issue the cookie so the "must change" flag it carries is cleared;
  // otherwise the guard bounces straight back here.
  await createSession({ ...user, mustChangePassword: false });

  await audit(user, {
    module: 'users',
    action: 'change_password',
    entityType: 'User',
    entityId: user.id,
    summary: `${user.name} changed their own password`,
    sensitive: true,
  });

  redirect(home(user.role));
}

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireSessionPage();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Change your password"
        subtitle={
          user.mustChangePassword
            ? 'Everyone sets their own password before using the system.'
            : undefined
        }
      />
      {error && <Notice kind="error">{error}</Notice>}
      <form action={changePassword} className="card space-y-4 p-5">
        <label className="block">
          <span className="label">Current password</span>
          <input className="field" name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input className="field" name="next" type="password" autoComplete="new-password" required minLength={10} />
          <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
            At least 10 characters. A short phrase you will remember beats a scramble you will write down.
          </span>
        </label>
        <label className="block">
          <span className="label">New password again</span>
          <input className="field" name="confirm" type="password" autoComplete="new-password" required />
        </label>
        <button className="btn btn-primary w-full" type="submit">
          Save
        </button>
      </form>
    </div>
  );
}
