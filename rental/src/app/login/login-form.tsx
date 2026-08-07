'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary w-full" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-[#fbe9e7] p-3 text-sm text-[color:var(--bad)]">
          {state.error}
        </p>
      )}
      <label className="block">
        <span className="label">Email</span>
        <input className="field" name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input
          className="field"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Submit />
    </form>
  );
}
