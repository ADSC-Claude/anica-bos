'use client';

import { useActionState, useState } from 'react';
import { saveSupplierAction, type FormState } from '../actions';

type Supplier = {
  id: string; name: string; contactPerson: string; mobile: string; email: string;
  address: string; paymentTerms: string; notes: string; active: boolean;
};

export function SupplierForm({ suppliers }: { suppliers: Supplier[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveSupplierAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = suppliers.find((s) => s.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing supplier</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— add a new supplier —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <label className="block">
          <span className="label">Contact person</span>
          <input name="contactPerson" className="input" defaultValue={current?.contactPerson} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Mobile</span>
            <input name="mobile" className="input" defaultValue={current?.mobile} />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" className="input" defaultValue={current?.email} />
          </label>
        </div>
        <label className="block">
          <span className="label">Address</span>
          <input name="address" className="input" defaultValue={current?.address} />
        </label>
        <label className="block">
          <span className="label">Payment terms</span>
          <input name="paymentTerms" className="input" defaultValue={current?.paymentTerms}
            placeholder="e.g. COD, 15 days, 30 days" />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <textarea name="notes" className="textarea" rows={2} defaultValue={current?.notes} />
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Supplier is active
        </label>
        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save supplier' : 'Add supplier'}
        </button>
      </form>
    </div>
  );
}
