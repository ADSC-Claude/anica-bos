import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PolicyBody } from '@/components/landing/policy';
import { BackArrow } from '@/components/back';

export const metadata = { title: 'Refund policy' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [s, session] = await Promise.all([getSettings(), getSession()]);
  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main className="mx-auto max-w-3xl px-5 py-12">
        <BackArrow href="/" label="Back" />
        <h1 className="display mt-4 text-4xl">Refund policy</h1>
        <PolicyBody kind="refund" s={s} />
      </main>
      <SiteFooter s={s} />
    </>
  );
}
