import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { home } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { SignupForm } from '../login/form';

export const metadata = { title: 'Create an account', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession();
  const { next } = await searchParams;
  if (session) redirect(next?.startsWith('/') ? next : home(session.role));
  const settings = await getSettings();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="display mb-1 text-2xl">{settings['business.name']}</Link>
      <p className="mb-6 text-sm text-[color:var(--color-ink-500)]">Create an account to buy and build your invitation. Takes a minute.</p>
      <div className="card p-5">
        <SignupForm next={next} />
      </div>
      <p className="mt-6 text-center text-xs text-[color:var(--color-ink-500)]">Google and Facebook sign-in are on the roadmap — for now, email works everywhere, including inside the Messenger browser.</p>
    </main>
  );
}
