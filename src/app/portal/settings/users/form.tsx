'use client';

import { useActionState, useState } from 'react';
import { saveUserAction, type FormState } from '../actions';

type U = {
  id: string; name: string; email: string; role: string;
  branchId: string; employeeId: string; active: boolean;
};

export function UserForm({
  branchId,
  users,
  employees,
  branches,
}: {
  branchId: string;
  users: U[];
  employees: { id: string; name: string; employeeRole: string }[];
  branches: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveUserAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = users.find((u) => u.id === selectedId);
  const [role, setRole] = useState(current?.role ?? 'RECEPTIONIST');

  function select(id: string) {
    setSelectedId(id);
    setRole(users.find((u) => u.id === id)?.role ?? 'RECEPTIONIST');
  }

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an account</span>
        <select className="select" value={selectedId} onChange={(e) => select(e.target.value)}>
          <option value="">— create a new account —</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Full name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <label className="block">
          <span className="label">Email *</span>
          <input name="email" type="email" className="input" defaultValue={current?.email} required />
        </label>
        <label className="block">
          <span className="label">Role *</span>
          <select name="role" className="select" value={role}
            onChange={(e) => setRole(e.target.value)}>
            <option value="OWNER">Owner — everything</option>
            <option value="ADMIN">Admin / Manager</option>
            <option value="RECEPTIONIST">Receptionist</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Branch</span>
          <select name="branchId" className="select" defaultValue={current?.branchId || branchId}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Linked employee record</span>
          <select name="employeeId" className="select" defaultValue={current?.employeeId ?? ''}>
            <option value="">— none —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.employeeRole.toLowerCase()})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{selectedId ? 'Reset password (leave blank to keep)' : 'Initial password *'}</span>
          <input name="password" type="password" className="input" minLength={selectedId ? 0 : 10}
            placeholder="At least 10 characters" />
        </label>
        {role === 'OWNER' ? (
          <label className="block">
            <span className="label">Approval PIN (Owner only)</span>
            <input name="pin" type="password" inputMode="numeric" className="input"
              placeholder="Leave blank to keep the current PIN" />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Used to approve voids, refunds and large manual discounts at the POS.
            </span>
          </label>
        ) : (
          <p className="rounded-xl bg-sand-100 p-3 text-[11px] text-cocoa-500">
            Only an Owner can approve voids, refunds and large manual discounts. Saving this
            account as a {role === 'ADMIN' ? 'manager' : 'receptionist'} clears any approval
            PIN it holds.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Account can sign in
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save account' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
