'use client';

import { useActionState } from 'react';
import { voidSaleAction, type SimpleState } from '../actions';

export function VoidForm({ saleId }: { saleId: string }) {
  const [state, action] = useActionState<SimpleState, FormData>(voidSaleAction, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="saleId" value={saleId} />
      <label className="block">
        <span className="label">Reason *</span>
        <input name="reason" className="input" required placeholder="e.g. wrong service rung up" />
      </label>
      <label className="block">
        <span className="label">Owner approval PIN *</span>
        <input name="pin" type="password" inputMode="numeric" className="input" required />
      </label>
      {state.error && <p className="text-sm text-clay-500">{state.error}</p>}
      {state.ok && <p className="text-sm text-cocoa-600">{state.ok}</p>}
      <button className="btn-danger" type="submit">
        Void sale
      </button>
    </form>
  );
}
