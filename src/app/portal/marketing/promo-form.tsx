'use client';

import { useActionState, useState } from 'react';
import { savePromoAction, type FormState } from './actions';

type Promo = {
  id: string; name: string; description: string;
  type: 'PERCENT' | 'FIXED'; value: number;
  startDate: string; endDate: string; serviceIds: string[];
  code: string; active: boolean; showOnLanding: boolean;
};

export function PromoForm({
  promos,
  services,
}: {
  promos: Promo[];
  services: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(savePromoAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = promos.find((p) => p.id === selectedId);

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing promo</span>
        <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">— create a new promo —</option>
          {promos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <label className="block">
          <span className="label">Description (shown on the landing page)</span>
          <textarea name="description" className="textarea" rows={2} defaultValue={current?.description} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Discount type</span>
            <select name="type" className="select" defaultValue={current?.type ?? 'PERCENT'}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed ₱ off</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Value</span>
            <input name="value" type="number" step="0.01" min={0} className="input"
              defaultValue={current?.value ?? 0} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Starts *</span>
            <input name="startDate" type="date" className="input" defaultValue={current?.startDate} required />
          </label>
          <label className="block">
            <span className="label">Ends *</span>
            <input name="endDate" type="date" className="input" defaultValue={current?.endDate} required />
          </label>
        </div>
        <label className="block">
          <span className="label">Promo code (optional)</span>
          <input name="code" className="input" defaultValue={current?.code} placeholder="WEEKDAY15" />
        </label>
        <fieldset>
          <legend className="label">Applies to (leave empty for all services)</legend>
          <div className="max-h-40 space-y-1 overflow-y-auto">
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
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="showOnLanding" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.showOnLanding ?? true} />
          Show on the public landing page
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save promo' : 'Create promo'}
        </button>
      </form>
    </div>
  );
}
