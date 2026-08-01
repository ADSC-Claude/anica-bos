'use client';

import { useActionState, useState } from 'react';
import { saveDiscountPresetAction, type FormState } from '../actions';

type P = {
  id: string; name: string; type: string; value: number; serviceIds: string[];
  stackable: boolean; requiresId: boolean; membersOnly: boolean;
  isEmployeeRate: boolean; monthlyUsageLimit: number; familyIncluded: boolean;
  active: boolean; sortRank: number;
};

export function DiscountPresetForm({
  presets,
  services,
}: {
  presets: P[];
  services: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveDiscountPresetAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = presets.find((p) => p.id === selectedId);
  const [isEmployeeRate, setIsEmployeeRate] = useState(current?.isEmployeeRate ?? false);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit a button</span>
        <select
          className="select"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setIsEmployeeRate(presets.find((p) => p.id === e.target.value)?.isEmployeeRate ?? false);
          }}
        >
          <option value="">— create a new button —</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Button label *</span>
          <input name="name" className="input" defaultValue={current?.name} required
            placeholder="e.g. Member 10%" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="label">Type</span>
            <select name="type" className="select" defaultValue={current?.type ?? 'PERCENT'}>
              <option value="PERCENT">%</option>
              <option value="FIXED">₱</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Value</span>
            <input name="value" type="number" step="0.01" min={0} className="input"
              defaultValue={current?.value ?? 0} />
            <span className="mt-1 block text-[11px] text-cocoa-400">Decimals are fine — 7.5</span>
          </label>
          <label className="block">
            <span className="label">Order</span>
            <input name="sortRank" type="number" className="input" defaultValue={current?.sortRank ?? 0} />
          </label>
        </div>

        <fieldset>
          <legend className="label">Applicable services (empty = all)</legend>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="serviceIds" value={s.id} className="h-4 w-4 accent-[#6b4e35]"
                  defaultChecked={current?.serviceIds.includes(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="stackable" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.stackable ?? true} />
          Stackable with other discounts
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="requiresId" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.requiresId ?? false} />
          Prompt for an ID number (PWD / Senior — printed on the receipt)
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="membersOnly" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.membersOnly ?? false} />
          Highlight when the client is a member
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="isEmployeeRate" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.isEmployeeRate ?? false}
            onChange={(e) => setIsEmployeeRate(e.target.checked)} />
          This is the employee rate
        </label>

        {isEmployeeRate && (
          <div className="space-y-2 rounded-xl bg-sand-100 p-3">
            <label className="block">
              <span className="label">Usage limit per employee per month (0 = unlimited)</span>
              <input name="monthlyUsageLimit" type="number" min={0} className="input"
                defaultValue={current?.monthlyUsageLimit ?? 0} />
            </label>
            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input type="checkbox" name="familyIncluded" className="h-5 w-5 accent-[#6b4e35]"
                defaultChecked={current?.familyIncluded ?? false} />
              Family members may use it too
            </label>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Show this button at checkout
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save button' : 'Create button'}
        </button>
      </form>
    </div>
  );
}
