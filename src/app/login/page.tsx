import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Staff sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/portal');

  const showDemo = process.env.NODE_ENV !== 'production';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-sand-100 to-sand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cocoa-600 text-2xl text-white">
            ✿
          </div>
          <h1 className="font-display text-2xl font-semibold text-cocoa-800">ANICA Wellness Spa</h1>
          <p className="muted mt-1">Business Operating System</p>
        </div>

        <div className="card-pad">
          <LoginForm />
        </div>

        {showDemo && (
          <div className="card-pad mt-4 text-xs text-cocoa-600">
            <p className="mb-2 font-semibold uppercase tracking-wide text-cocoa-500">
              Demo accounts (seed data)
            </p>
            <ul className="space-y-1">
              <li>Owner · owner@anicaspa.ph · <code>anica-owner</code></li>
              <li>Manager (Admin) · manager@anicaspa.ph · <code>anica-admin</code></li>
              <li>Receptionist · reception@anicaspa.ph · <code>anica-front</code></li>
            </ul>
            <p className="mt-2 text-cocoa-400">
              Each account is forced to change its password on first sign-in.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/" className="text-cocoa-600 underline underline-offset-4">
            ← Back to the ANICA website
          </Link>
        </p>
      </div>
    </main>
  );
}
