'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { changePasswordAction, type ChangePasswordState } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save new password'}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">
          Current password
        </label>
        <input id="current" name="current" type="password" required className="input" autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">
          New password (at least 10 characters)
        </label>
        <input id="next" name="next" type="password" required minLength={10} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Repeat new password
        </label>
        <input id="confirm" name="confirm" type="password" required minLength={10} className="input" autoComplete="new-password" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  );
}
