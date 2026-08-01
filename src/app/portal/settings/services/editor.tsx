'use client';

import { useActionState, useState } from 'react';
import { saveServiceAction, type FormState } from '../actions';

type Service = {
  id: string; name: string; categoryId: string; alsoInCategoryIds: string[]; description: string;
  requiredResourceType: string;
  sequenceRank?: number;
  changeoverMinutes?: number | null;
  durationMinutes: number; price: number;
  commissionType: string; commissionValue: number;
  active: boolean; showOnLanding: boolean; sortRank: number;
  recipes: { itemId: string; quantity: number }[];
};

let seq = 0;

export function ServiceEditor({
  services,
  categories,
  items,
}: {
  services: Service[];
  categories: { id: string; name: string; isAddOns?: boolean }[];
  items: { id: string; name: string; unitName: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveServiceAction, {});
  const [selectedId, setSelectedId] = useState('');
  const current = services.find((s) => s.id === selectedId);
  const [commissionType, setCommissionType] = useState(current?.commissionType ?? '');
  const [primaryId, setPrimaryId] = useState(current?.categoryId ?? categories[0]?.id ?? '');
  /** The chosen category, when it is the add-ons shelf. */
  const addOnCategory = categories.find((c) => c.id === primaryId && c.isAddOns);
  const [recipes, setRecipes] = useState<{ key: string; itemId: string; quantity: string }[]>([]);

  function select(id: string) {
    setSelectedId(id);
    const s = services.find((x) => x.id === id);
    setCommissionType(s?.commissionType ?? '');
    setPrimaryId(s?.categoryId ?? categories[0]?.id ?? '');
    setRecipes(
      (s?.recipes ?? []).map((r) => ({ key: `r${++seq}`, itemId: r.itemId, quantity: String(r.quantity) })),
    );
  }

  return (
    <div className="card-pad space-y-4">
      <label className="block">
        <span className="label">Edit an existing service</span>
        <select className="select" value={selectedId} onChange={(e) => select(e.target.value)}>
          <option value="">— create a new service —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      <form action={action} className="space-y-3" key={selectedId}>
        <input type="hidden" name="id" value={selectedId} />
        <label className="block">
          <span className="label">Name *</span>
          <input name="name" className="input" defaultValue={current?.name} required />
        </label>
        <label className="block">
          <span className="label">Category *</span>
          <select
            name="categoryId"
            className="select"
            value={primaryId}
            onChange={(e) => setPrimaryId(e.target.value)}
          >
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Where it sits in the POS, and the category its revenue is reported under.
          </span>
        </label>
        {categories.length > 1 && (
          <fieldset className="block">
            <legend className="label">Also list under</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {categories
                .filter((c) => c.id !== primaryId)
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="alsoInCategoryIds"
                      value={c.id}
                      className="h-5 w-5 accent-[#6b4e35]"
                      defaultChecked={current?.alsoInCategoryIds.includes(c.id) ?? false}
                    />
                    {c.name}
                  </label>
                ))}
            </div>
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Optional. The service appears under these headings on the public price list as
              well — the POS and reports still use the category above, so nothing is counted
              twice.
            </span>
          </fieldset>
        )}
        <label className="block">
          <span className="label">Where it is performed *</span>
          <select
            name="requiredResourceType"
            className="select"
            defaultValue={current?.requiredResourceType ?? 'BED'}
          >
            <option value="BED">Bed — rooms and open beds</option>
            <option value="CHAIR">Chair — the foot spa &amp; reflexology area</option>
            <option value="SAUNA">Sauna</option>
            <option value="">Anywhere that is free</option>
          </select>
          <span className="mt-1 block text-[11px] text-cocoa-400">
            Bookings are only offered places of this kind. A foot spa set to
            &ldquo;bed&rdquo; would occupy a bed that could have been sold, and a massage
            set to &ldquo;chair&rdquo; would block the foot spa area.
          </span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Usual place in a visit</span>
            <input name="sequenceRank" type="number" min={0} step={10} className="input"
              defaultValue={current?.sequenceRank ?? 50} />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              When a guest books more than one treatment, the lower number runs first. Sauna 10,
              foot spa 20, massage 30 — so heat and soaking come before the table without anyone
              being asked. The guest can still reorder her own visit.
            </span>
          </label>
          <label className="block">
            <span className="label">Changeover after (minutes)</span>
            <input name="changeoverMinutes" type="number" min={0} step={5} className="input"
              placeholder="house default"
              defaultValue={current?.changeoverMinutes ?? ''} />
            <span className="mt-1 block text-[11px] text-cocoa-400">
              Floor time needed after this treatment before the next can start. Leave blank to use
              the house default from{' '}
              <a href="/portal/settings/booking" className="underline underline-offset-2">
                Booking
              </a>
              . A sauna wants longer for the shower; most treatments do not.
            </span>
          </label>
        </div>
        {/* Being an add-on follows from the category, so it is reported here
            rather than asked again. Two places to set one thing is how they
            end up disagreeing. */}
        {addOnCategory && (
          <p className="rounded-xl border border-sand-200 bg-sand-50 px-3 py-2 text-[11px] text-cocoa-600">
            Filed under <strong>{addOnCategory.name}</strong>, so this runs straight on from the
            treatment before it — no changeover in front of it, and in the same place. Move it to
            another category if a guest should be able to book it on its own.
          </p>
        )}
        <label className="block">
          <span className="label">Description (landing page)</span>
          <textarea name="description" className="textarea" rows={2} defaultValue={current?.description} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="label">Minutes *</span>
            <input name="durationMinutes" type="number" min={5} step={5} className="input"
              defaultValue={current?.durationMinutes ?? 60} required />
          </label>
          <label className="block">
            <span className="label">Price (₱) *</span>
            <input name="price" type="number" step="0.01" min={0} className="input"
              defaultValue={current?.price ?? 0} required />
          </label>
          <label className="block">
            <span className="label">Order</span>
            <input name="sortRank" type="number" className="input" defaultValue={current?.sortRank ?? 0} />
            <span className="mt-1 block text-[11px] text-cocoa-400">On the price list.</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Commission rule</span>
            <select name="commissionType" className="select" value={commissionType}
              onChange={(e) => setCommissionType(e.target.value)}>
              <option value="">Use the default (25%)</option>
              <option value="PERCENT">Percent of list price</option>
              <option value="FIXED">Fixed ₱ per service</option>
            </select>
          </label>
          {commissionType && (
            <label className="block">
              <span className="label">Value</span>
              <input name="commissionValue" type="number" step="0.01" min={0} className="input"
                defaultValue={current?.commissionValue ?? 0} />
            </label>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Consumption recipe (auto-deducted at checkout)</legend>
          {recipes.map((r, i) => (
            <div key={r.key} className="flex gap-1.5">
              <select className="select flex-1" name="recipeItemId" value={r.itemId}
                onChange={(e) => setRecipes((p) => p.map((x, xi) => xi === i ? { ...x, itemId: e.target.value } : x))}>
                <option value="">Choose an item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name} ({it.unitName})</option>
                ))}
              </select>
              <input name="recipeQty" type="number" step="0.01" min={0} className="input w-24"
                value={r.quantity}
                onChange={(e) => setRecipes((p) => p.map((x, xi) => xi === i ? { ...x, quantity: e.target.value } : x))} />
              <button type="button" className="btn-ghost btn-sm text-clay-500"
                onClick={() => setRecipes((p) => p.filter((_, xi) => xi !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn-secondary btn-sm w-full"
            onClick={() => setRecipes((p) => [...p, { key: `r${++seq}`, itemId: '', quantity: '' }])}>
            + Add consumable
          </button>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="active" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.active ?? true} />
          Active (bookable and sellable)
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-700">
          <input type="checkbox" name="showOnLanding" className="h-5 w-5 accent-[#6b4e35]"
            defaultChecked={current?.showOnLanding ?? true} />
          Show on the public price list
        </label>

        {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
        {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
        <button className="btn-primary w-full" type="submit">
          {selectedId ? 'Save service' : 'Create service'}
        </button>
      </form>
    </div>
  );
}
