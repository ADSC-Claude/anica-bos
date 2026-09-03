import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PolicyBody } from '@/components/landing/policy';

export const metadata = { title: 'Privacy policy' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [s, session] = await Promise.all([getSettings(), getSession()]);
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="display text-4xl">Privacy policy</h1>
        <PolicyBody kind="privacy" s={s} />
      </main>
      <SiteFooter s={s} />
    </>
  );
}
