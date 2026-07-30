'use client';

import { useActionState, useState } from 'react';
import { saveCorporateAccountAction, type FormState } from '../actions';

type Account = {
  id: string;
  name: string;
  tin: string;
  billingAddress: string;
  contactPerson: string;
  contactMobile: string;
  contactEmail: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  creditLimitCents: number;
  paymentTermsDays: number;
  active: boolean;
};

export function CorporateAccountForm({ accounts }: { accounts: Account[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveCorporateAccountAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = accounts.find((a) => a.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing account</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— create a new account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Company name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">TIN</span>
            <input name="tin" className="input" defaultValue={current?.tin} />
          </label>
          <label className="block">
            <span className="label">Payment terms (days)</span>
            <input name="paymentTermsDays" type="number" min={0} className="input"
              defaultValue={current?.paymentTermsDays ?? 30} />
          </label>
        </div>
        <label className="block">
          <span className="label">Billing address</span>
          <input name="billingAddress" className="input" defaultValue={current?.billingAddress} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Contact person</span>
            <input name="contactPerson" className="input" defaultValue={current?.contactPerson} />
          </label>
          <label className="block">
            <span className="label">Mobile</span>
            <input name="contactMobile" className="input" defaultValue={current?.contactMobile} />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input name="contactEmail" type="email" className="input" defaultValue={current?.contactEmail} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Negotiated rate type</span>
            <select name="discountType" className="select" defaultValue={current?.discountType ?? 'PERCENT'}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed ₱ off</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Rate value</span>
            <input name="discountValue" type="number" min={0} className="input"
              defaultValue={current?.discountValue ?? 0} />
          </label>
          <label className="block">
            <span className="label">Credit limit (₱)</span>
            <input name="creditLimit" type="number" min={0} step="0.01" className="input"
              defaultValue={current ? current.creditLimitCents / 100 : 0} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-moss-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#345a3e]"
            defaultChecked={current?.active ?? true} />
          Account is active
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
        <button className="btn-primary" type="submit">
          {selectedId ? 'Save account' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
