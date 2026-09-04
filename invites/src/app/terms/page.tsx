import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PolicyBody } from '@/components/landing/policy';

export const metadata = { title: 'Terms of service' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [s, session] = await Promise.all([getSettings(), getSession()]);
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="display text-4xl">Terms of service</h1>
        <PolicyBody kind="terms" s={s} />
      </main>
      <SiteFooter s={s} />
    </>
  );
}
