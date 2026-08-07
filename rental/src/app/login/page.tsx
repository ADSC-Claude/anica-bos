import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { home } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { LoginForm } from './login-form';
import { ROLE_LABELS } from '@/lib/rbac';

export const metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ended?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(home(session.role));

  const { ended } = await searchParams;
  const settings = await getSettings();

  // The seeded sign-ins are a development convenience. Rendering them in
  // production would put a working login on a public page.
  const demo =
    process.env.NODE_ENV === 'development'
      ? await prisma.user.findMany({
          where: { active: true },
          select: { email: true, role: true, name: true },
          orderBy: { role: 'asc' },
        })
      : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="display mb-1 text-2xl font-bold">
        {settings['business.name']}
      </Link>
      <p className="mb-6 text-sm text-[color:var(--color-ink-500)]">Staff sign-in</p>

      {ended && (
        <p role="alert" className="mb-4 rounded-lg border border-[color:var(--warn)] bg-[#fdf0dd] p-3 text-sm">
          Your session ended. Please sign in again.
        </p>
      )}

      <div className="card p-5">
        <LoginForm />
      </div>

      {demo.length > 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-[color:var(--color-sand-300)] p-4 text-xs">
          <p className="mb-2 font-semibold">Seeded accounts (development only)</p>
          <ul className="space-y-1">
            {demo.map((u) => (
              <li key={u.email} className="flex justify-between gap-2">
                <span className="font-mono">{u.email}</span>
                <span className="text-[color:var(--color-ink-500)]">{ROLE_LABELS[u.role]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[color:var(--color-ink-500)]">
            The seed prints the shared password when it runs. Every account is forced to change it on
            first sign-in.
          </p>
        </div>
      )}

      <Link href="/" className="mt-6 text-center text-sm text-[color:var(--color-clay-600)] hover:underline">
        ← Back to the website
      </Link>
    </main>
  );
}
