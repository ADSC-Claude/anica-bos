'use client';

import { useActionState } from 'react';
import { changePasswordAction, type PasswordState } from '../actions';

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" required className="field" autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" required minLength={8} className="field" autoComplete="new-password" /></div>
      {state.error && <p role="alert" className="text-sm text-[color:var(--bad)]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[color:var(--ok)]">Password changed.</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>Save</button>
    </form>
  );
}
