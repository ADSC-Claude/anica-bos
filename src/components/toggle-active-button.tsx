'use client';

import { useActionState } from 'react';
import type { FormState } from '@/app/portal/marketing/actions';

/**
 * Switch something off, and back on again.
 *
 * Deliberately not a delete. What the spa actually wants when a promo is
 * embarrassing them on the website is for it to stop showing — and a row that
 * is gone cannot be switched on again next September, nor answer "what were we
 * offering last April".
 *
 * Switching off asks first, because it changes what the public sees. Switching
 * on does not: it is the reversible direction.
 */
export function ToggleActiveButton({
  action,
  id,
  label,
  on,
  offVerb = 'Switch off',
  onVerb = 'Switch on',
  confirm,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  id: string;
  /** The record's name, for the confirmation. */
  label: string;
  /** Whether it is currently on. */
  on: boolean;
  offVerb?: string;
  onVerb?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          on &&
          !window.confirm(confirm ?? `Switch “${label}” off? It stops showing on the website.`)
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="on" value={on ? '0' : '1'} />
      <button
        type="submit"
        disabled={pending}
        className={`btn btn-sm ${
          on ? 'border border-sand-300 bg-white text-cocoa-700 hover:bg-sand-100' : 'btn-primary'
        }`}
      >
        {pending ? 'Saving…' : on ? offVerb : onVerb}
      </button>
      {state.error && <span className="text-[11px] text-clay-500">{state.error}</span>}
      {state.ok && <span className="text-[11px] text-cocoa-500">{state.ok}</span>}
    </form>
  );
}
