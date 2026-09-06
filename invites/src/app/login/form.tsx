'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { loginAction, signupAction, type AuthState } from './actions';

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="field" placeholder="you@email.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-[#fbe9e7] px-3 py-2 text-sm text-[#8f1d17]">{state.error}</p>}
      <Submit label="Sign in" pending="Signing in…" />
      <p className="text-center text-sm text-[color:var(--color-ink-500)]">
        New here?{' '}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-[color:var(--color-plum-600)] underline">Create an account</Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(signupAction, {});
  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required className="field" placeholder="Maria Santos" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" placeholder="you@email.com" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Mobile number <span className="font-normal text-[color:var(--color-ink-500)]">(optional, for Viber)</span></label>
        <input id="phone" name="phone" inputMode="tel" autoComplete="tel" className="field" placeholder="0917 000 0000" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field" />
        <p className="hint">At least 8 characters.</p>
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-[#fbe9e7] px-3 py-2 text-sm text-[#8f1d17]">{state.error}</p>}
      <Submit label="Create account" pending="Creating…" />
      <p className="text-center text-xs text-[color:var(--color-ink-500)]">
        By continuing you agree to our <Link href="/terms" className="underline">terms</Link> and <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
      <p className="text-center text-sm text-[color:var(--color-ink-500)]">
        Already have an account?{' '}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-[color:var(--color-plum-600)] underline">Sign in</Link>
      </p>
    </form>
  );
}
