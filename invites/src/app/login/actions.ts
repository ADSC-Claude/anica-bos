'use server';

import { redirect } from 'next/navigation';
import { login, signup, destroySession } from '@/lib/auth';
import { home } from '@/lib/guard';

export type AuthState = { error?: string };

/** Only same-origin paths are honoured, so a crafted link cannot bounce a fresh sign-in elsewhere. */
function safeNext(raw: unknown): string | null {
  const s = String(raw ?? '');
  return s.startsWith('/') && !s.startsWith('//') ? s : null;
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const result = await login(email, password);
  if (!result.ok) return { error: result.error };
  if (result.user.mustChangePassword) redirect('/admin/change-password');
  redirect(safeNext(formData.get('next')) ?? home(result.user.role));
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const result = await signup({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  });
  if (!result.ok) return { error: result.error };
  redirect(safeNext(formData.get('next')) ?? '/account');
}

export async function logoutAction() {
  await destroySession();
  redirect('/');
}
