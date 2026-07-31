import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { BrandMark } from '@/components/brand-mark';
import { LoginForm } from './login-form';

// robots.txt asks crawlers not to fetch this; `noindex` tells the ones that
// fetched it anyway not to list it. A staff sign-in form in search results is an
// invitation to try passwords against it.
export const metadata = {
  title: 'Staff sign in',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/portal');
  const settings = await getSettings();

  const showDemo = process.env.NODE_ENV !== 'production';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-sand-100 to-sand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <BrandMark logoUrl={settings['business.logoUrl']} size={56} className="mx-auto mb-3" />
          <h1 className="font-display text-2xl font-semibold text-cocoa-800">
            {settings['business.name']}
          </h1>
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
