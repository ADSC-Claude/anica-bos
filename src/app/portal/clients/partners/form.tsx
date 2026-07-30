'use client';

import { useActionState, useState } from 'react';
import { savePartnerAction, type FormState } from '../actions';

type Partner = {
  id: string;
  name: string;
  type: string;
  contactPerson: string;
  contactMobile: string;
  contactEmail: string;
  feeType: 'PERCENT' | 'FIXED';
  feeValue: number;
  guestDiscountType: 'PERCENT' | 'FIXED';
  guestDiscountValue: number;
  promoCode: string;
  terms: string;
  active: boolean;
};

const TYPES = ['hotel', 'condo', 'office', 'gym', 'influencer', 'other'];

export function PartnerForm({ partners }: { partners: Partner[] }) {
  const [state, action] = useActionState<FormState, FormData>(savePartnerAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = partners.find((p) => p.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing partner</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— create a new partner —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Partner name *</span>
            <input name="name" className="input" defaultValue={current?.name} required />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select name="type" className="select" defaultValue={current?.type ?? 'hotel'}>
              {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </label>
        </div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Referral fee type</span>
            <select name="feeType" className="select" defaultValue={current?.feeType ?? 'PERCENT'}>
              <option value="PERCENT">% of revenue</option>
              <option value="FIXED">₱ per referral</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Referral fee value</span>
            <input name="feeValue" type="number" min={0} step="0.01" className="input"
              defaultValue={current?.feeValue ?? 0} />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">Guest discount type</span>
            <select name="guestDiscountType" className="select"
              defaultValue={current?.guestDiscountType ?? 'PERCENT'}>
              <option value="PERCENT">Percent</option>
              <option value="FIXED">Fixed ₱</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Guest discount value</span>
            <input name="guestDiscountValue" type="number" min={0} className="input"
              defaultValue={current?.guestDiscountValue ?? 0} />
          </label>
          <label className="block">
            <span className="label">Promo / voucher code</span>
            <input name="promoCode" className="input" defaultValue={current?.promoCode}
              placeholder="CASADILIMAN" />
          </label>
        </div>
        <label className="block">
          <span className="label">Agreement terms</span>
          <textarea name="terms" className="textarea" rows={2} defaultValue={current?.terms} />
        </label>
        <label className="flex items-center gap-2 text-sm text-moss-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#345a3e]"
            defaultChecked={current?.active ?? true} />
          Partner is active
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-moss-600">{state.ok}</p>}
        <button className="btn-primary" type="submit">
          {selectedId ? 'Save partner' : 'Create partner'}
        </button>
      </form>
    </div>
  );
}
