'use client';

import { useActionState, useState } from 'react';
import { saveBranchAction, type FormState } from '../actions';

type B = {
  id: string; name: string; code: string; address: string; contact: string;
  openMinute: number; closeMinute: number; active: boolean;
};

export function BranchForm({ branches }: { branches: B[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveBranchAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = branches.find((b) => b.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit a branch</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— open a new branch —</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Branch name *</span>
          <input name="name" className="input" defaultValue={current?.name} required
            placeholder="e.g. ANICA Marikina" />
        </label>
        <label className="block">
          <span className="label">Short code *</span>
          <input name="code" className="input uppercase" defaultValue={current?.code} required
            maxLength={6} placeholder="MRK" />
          <span className="mt-1 block text-[11px] text-moss-400">
            Used for the branch receipt prefix (SI + code).
          </span>
        </label>
        <label className="block">
          <span className="label">Address</span>
          <input name="address" className="input" defaultValue={current?.address} />
        </label>
        <label className="block">
          <span className="label">Contact</span>
          <input name="contact" className="input" defaultValue={current?.contact} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Opens at (minutes)</span>
            <input name="openMinute" type="number" min={0} max={1440} className="input"
              defaultValue={current?.openMinute ?? 720} />
          </label>
          <label className="block">
            <span className="label">Closes at (minutes)</span>
            <input name="closeMinute" type="number" min={0} max={1440} className="input"
              defaultValue={current?.closeMinute ?? 1440} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-moss-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#345a3e]"
            defaultChecked={current?.active ?? true} />
          Branch is open for business
        </label>
        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save branch' : 'Open branch'}
        </button>
      </form>
    </div>
  );
}
