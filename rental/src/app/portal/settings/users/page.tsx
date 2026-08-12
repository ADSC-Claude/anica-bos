import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ROLE_LABELS, permissionsFor } from '@/lib/rbac';
import { randomCode } from '@/lib/codes';
import { normalizeEmail } from '@/lib/guests';
import { formatManila } from '@/lib/datetime';
import { formatPeso, toCents } from '@/lib/money';
import { audit } from '@/lib/audit';
import { BackLink, Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

const ROLES = ['OWNER', 'MANAGER', 'RESERVATIONS', 'ACCOUNTANT', 'CLEANER', 'INSPECTOR', 'MAINTENANCE'] as const;

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/settings/users?${kind}=${encodeURIComponent(message)}`);
}

/** A password nobody chose and everybody must change on first sign-in. */
function temporaryPassword(): string {
  return `${randomCode(4)}-${randomCode(4)}`;
}

async function createUserAction(formData: FormData) {
  'use server';
  const user = await requirePage('users.manage');
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const name = String(formData.get('name') ?? '').trim();
  if (!email || !name) back('A name and an email are required.', 'error');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) back('Someone already has that email address.', 'error');

  const password = temporaryPassword();
  const created = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: String(formData.get('role') || 'CLEANER') as never,
      phone: String(formData.get('phone') ?? ''),
      ratePerJobCents: toCents(String(formData.get('rate') || '0')),
      branchId: String(formData.get('branchId') || '') || null,
      // Every account starts needing a new password, so the one printed here is
      // only ever good for the first sign-in.
      mustChangePassword: true,
    },
  });

  const propertyIds = formData.getAll('propertyIds').map(String).filter(Boolean);
  if (propertyIds.length) {
    await prisma.userProperty.createMany({
      data: propertyIds.map((propertyId) => ({ userId: created.id, propertyId })),
    });
  }

  await audit(user, {
    module: 'users',
    action: 'create',
    entityType: 'User',
    entityId: created.id,
    summary: `Account created for ${name} (${created.role})`,
    after: { email, role: created.role, propertyIds },
  });

  back(`${name} can sign in with ${email} and the one-time password ${password} — they must change it immediately.`);
}

async function updateUserAction(formData: FormData) {
  'use server';
  const actor = await requirePage('users.manage');
  const id = String(formData.get('id'));

  const before = await prisma.user.findUnique({
    where: { id },
    select: { name: true, role: true, active: true, phone: true, ratePerJobCents: true, email: true },
  });
  if (!before) back('That account no longer exists.', 'error');

  const active = formData.get('active') === 'on';
  const role = String(formData.get('role') || before.role) as never;

  // Locking yourself out of the only owner account is not a mistake worth
  // being allowed to make quietly.
  if (before.role === 'OWNER' && (!active || role !== 'OWNER')) {
    const owners = await prisma.user.count({ where: { role: 'OWNER', active: true } });
    if (owners <= 1) back('That is the last active owner — promote someone else first.', 'error');
  }
  if (id === actor.id && !active) back('You cannot disable your own account.', 'error');

  const after = {
    name: String(formData.get('name') ?? '').trim() || before.name,
    role,
    active,
    phone: String(formData.get('phone') ?? ''),
    ratePerJobCents: toCents(String(formData.get('rate') || '0')),
    // Disabling an account kills its live sessions in the same write, rather
    // than leaving a signed-out person signed in for another twelve hours.
    ...(before.active && !active ? { sessionsRevoked: new Date() } : {}),
  };

  await prisma.user.update({ where: { id }, data: after });

  const propertyIds = formData.getAll('propertyIds').map(String).filter(Boolean);
  await prisma.userProperty.deleteMany({ where: { userId: id } });
  if (propertyIds.length) {
    await prisma.userProperty.createMany({
      data: propertyIds.map((propertyId) => ({ userId: id, propertyId })),
    });
  }

  await audit(actor, {
    module: 'users',
    action: 'update',
    entityType: 'User',
    entityId: id,
    summary: `${after.name} updated${before.active && !active ? ' and signed out everywhere' : ''}`,
    before,
    after: { ...after, propertyIds },
  });
  back('Saved.');
}

async function resetPasswordAction(formData: FormData) {
  'use server';
  const actor = await requirePage('users.manage');
  const id = String(formData.get('id'));
  const target = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true } });
  if (!target) back('That account no longer exists.', 'error');

  const password = temporaryPassword();
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      // Any token signed before this instant stops working — a reset that
      // leaves the old session alive protects nobody.
      sessionsRevoked: new Date(),
    },
  });

  await audit(actor, {
    module: 'users',
    action: 'password.reset',
    entityType: 'User',
    entityId: id,
    summary: `Password reset for ${target.name}; sessions revoked`,
  });
  back(`${target.name}'s one-time password is ${password}. They must change it at first sign-in.`);
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requirePage('users.manage');
  const sp = await searchParams;

  const [users, properties, branches] = await Promise.all([
    prisma.user.findMany({
      include: { properties: { select: { propertyId: true } }, branch: { select: { name: true } } },
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    }),
    prisma.property.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <BackLink href="/portal/settings">Settings</BackLink>
      <PageHeader
        title="People"
        subtitle="Who may sign in, what they may do, and which properties they may touch."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <Card title="Add someone" className="mb-4">
        <form action={createUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="label">Name *</span>
            <input className="field" name="name" required />
          </label>
          <label className="block">
            <span className="label">Email *</span>
            <input className="field" name="email" type="email" required />
          </label>
          <label className="block">
            <span className="label">Role</span>
            <select className="field" name="role" defaultValue="CLEANER">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Mobile</span>
            <input className="field" name="phone" />
          </label>
          <label className="block">
            <span className="label">Rate per job</span>
            <input className="field" name="rate" type="number" step="0.01" min="0" defaultValue="0" />
            <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
              Cleaners and inspectors paid per turnover. Zero for salaried.
            </span>
          </label>
          <label className="block">
            <span className="label">Branch</span>
            <select className="field" name="branchId" defaultValue="">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="label">Properties they may see</legend>
            <div className="flex flex-wrap gap-3">
              {properties.map((p) => (
                <label key={p.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="propertyIds" value={p.id} />
                  {p.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">
              None ticked means every property, except for cleaners, inspectors and maintenance —
              their reach comes from the tasks assigned to them, whatever is ticked here.
            </p>
          </fieldset>
          <div className="sm:col-span-2 lg:col-span-3">
            <button className="btn btn-primary" type="submit">
              Create the account
            </button>
          </div>
        </form>
      </Card>

      {users.length === 0 ? (
        <Empty>No accounts.</Empty>
      ) : (
        <div className="space-y-4">
          {users.map((u) => {
            const assigned = new Set(u.properties.map((p) => p.propertyId));
            return (
              <Card
                key={u.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {u.name}
                    <Pill tone={u.active ? 'ok' : 'muted'}>
                      {u.active ? ROLE_LABELS[u.role] : 'disabled'}
                    </Pill>
                    {u.mustChangePassword && <Pill tone="warn">must change password</Pill>}
                  </span>
                }
                actions={
                  <span className="text-xs text-[color:var(--color-ink-500)]">
                    {u.lastLoginAt ? `last in ${formatManila(u.lastLoginAt, { time: true })}` : 'never signed in'}
                    {' · '}
                    {permissionsFor(u.role).length} permissions
                  </span>
                }
              >
                <form action={updateUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="id" value={u.id} />
                  <label className="block">
                    <span className="label">Name</span>
                    <input className="field" name="name" defaultValue={u.name} />
                  </label>
                  <label className="block">
                    <span className="label">Email</span>
                    <input className="field" defaultValue={u.email} readOnly disabled />
                  </label>
                  <label className="block">
                    <span className="label">Role</span>
                    <select className="field" name="role" defaultValue={u.role}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Mobile</span>
                    <input className="field" name="phone" defaultValue={u.phone} />
                  </label>
                  <label className="block">
                    <span className="label">Rate per job</span>
                    <input
                      className="field"
                      name="rate"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={(u.ratePerJobCents / 100).toFixed(2)}
                    />
                    <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                      {formatPeso(u.ratePerJobCents)} per job
                    </span>
                  </label>
                  <fieldset className="sm:col-span-2 lg:col-span-3">
                    <legend className="label">Properties</legend>
                    <div className="flex flex-wrap gap-3">
                      {properties.map((p) => (
                        <label key={p.id} className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            name="propertyIds"
                            value={p.id}
                            defaultChecked={assigned.has(p.id)}
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={u.active} />
                    <span>Can sign in</span>
                  </label>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <button className="btn btn-primary" type="submit">
                      Save
                    </button>
                  </div>
                </form>

                <form action={resetPasswordAction} className="mt-3 border-t border-[color:var(--color-sand-200)] pt-3">
                  <input type="hidden" name="id" value={u.id} />
                  <button className="text-xs hover:underline" type="submit">
                    Reset password and sign them out everywhere
                  </button>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
