import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/rbac';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, BackLink, Field, Select, Checkbox } from '@/components/ui';
import { Flash, type FlashParams } from '../../flash';
import { saveStaffAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }: { searchParams: Promise<FlashParams & { edit?: string }> }) {
  await requireStaffPage('users.manage');
  const sp = await searchParams;
  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'ENCODER', 'SUPPORT'] } }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  const editing = sp.edit ? staff.find((u) => u.id === sp.edit) ?? null : null;
  return (
    <>
      <BackLink href="/admin/settings">Settings</BackLink>
      <PageHeader title="Staff accounts" subtitle="Owner/Admin sees everything. Encoders build DFY invitations. Support verifies payments and answers customers." />
      <Flash {...sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-x-auto"><table className="data">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
          <tbody>{staff.map((u) => <tr key={u.id}><td>{u.name}</td><td className="text-xs">{u.email}</td><td>{ROLE_LABELS[u.role]}</td><td className="text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</td><td>{u.active ? (u.mustChangePassword ? <span className="pill pill-warn">Must change password</span> : '') : <span className="pill pill-bad">Disabled</span>}</td><td><a href={`/admin/settings/users?edit=${u.id}`} className="underline">Edit</a></td></tr>)}</tbody>
        </table></div>
        <form action={saveStaffAction.bind(null, editing?.id ?? null, '/admin/settings/users')} className="card space-y-3 p-4">
          <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : 'New staff account'}</h2>
          <Field label="Name" name="name" defaultValue={editing?.name} required />
          {!editing && <Field label="Email" name="email" type="email" required />}
          <Select label="Role" name="role" defaultValue={editing?.role ?? 'ENCODER'} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <Field label={editing ? 'Reset password (blank to keep)' : 'Temporary password'} name="password" type="password" hint="They are asked to change it on first sign-in." autoComplete="new-password" />
          <Checkbox label="Active" name="active" defaultChecked={editing?.active ?? true} />
          <div className="flex gap-2"><button className="btn btn-primary" type="submit">Save</button>{editing && <a href="/admin/settings/users" className="btn btn-secondary">New instead</a>}</div>
        </form>
      </div>
    </>
  );
}
