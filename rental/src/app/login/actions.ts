'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { login, destroySession } from '@/lib/auth';
import { home } from '@/lib/guard';

const schema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Please enter your email and password.' };

  const result = await login(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.error };

  redirect(result.user.mustChangePassword ? '/portal/change-password' : home(result.user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
