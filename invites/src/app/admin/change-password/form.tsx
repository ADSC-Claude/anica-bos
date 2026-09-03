'use client';

import { useActionState } from 'react';
import { staffChangePasswordAction } from '../actions';

export function StaffPasswordForm() {
  const [state, formAction, pending] = useActionState<{ error?: string; ok?: boolean }, FormData>(staffChangePasswordAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <div><label className="label" htmlFor="current">Current password</label><input id="current" name="current" type="password" required className="field" autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="next">New password</label><input id="next" name="next" type="password" required minLength={8} className="field" autoComplete="new-password" /></div>
      {state.error && <p role="alert" className="text-sm text-[color:var(--bad)]">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>Save</button>
    </form>
  );
}
