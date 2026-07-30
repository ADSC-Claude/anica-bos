'use client';

import { useActionState, useState } from 'react';
import { savePermitAction, type FormState } from '../actions';

type Permit = {
  id: string; name: string; agency: string; refNumber: string;
  issueDate: string; expiryDate: string; fileUrl: string; notes: string; employeeId: string;
};

export function PermitForm({
  permits,
  employees,
}: {
  permits: Permit[];
  employees: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(savePermitAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = permits.find((p) => p.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing entry</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— add a new permit or certificate —</option>
          {permits.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Name *</span>
          <input name="name" className="input" defaultValue={current?.name} required
            placeholder="e.g. Mayor's / Business Permit" />
        </label>
        <label className="block">
          <span className="label">Issuing agency</span>
          <input name="agency" className="input" defaultValue={current?.agency} />
        </label>
        <label className="block">
          <span className="label">Reference number</span>
          <input name="refNumber" className="input" defaultValue={current?.refNumber} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Issued</span>
            <input name="issueDate" type="date" className="input" defaultValue={current?.issueDate} />
          </label>
          <label className="block">
            <span className="label">Expires</span>
            <input name="expiryDate" type="date" className="input" defaultValue={current?.expiryDate} />
          </label>
        </div>
        <label className="block">
          <span className="label">Employee (for staff certifications)</span>
          <select name="employeeId" className="select" defaultValue={current?.employeeId ?? ''}>
            <option value="">— business-wide permit —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Document scan URL</span>
          <input name="fileUrl" className="input" defaultValue={current?.fileUrl} />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <textarea name="notes" className="textarea" rows={2} defaultValue={current?.notes} />
        </label>
        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save entry' : 'Add entry'}
        </button>
      </form>
    </div>
  );
}
