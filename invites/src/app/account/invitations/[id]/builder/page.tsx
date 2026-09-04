import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { contentOf } from '@/lib/invitations';
import { sectionsFor, sectionLabel, sectionMinTier, sectionUnlocked, sectionFilled, fieldsFor, emptySection, type SectionKey } from '@/lib/sections';
import { galleryLimit } from '@/lib/tiers';
import { Builder } from '@/components/builder/builder';
import { InvitationPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function BuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const { id } = await params;
  const { section } = await searchParams;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  if (inv.order && inv.order.status !== 'ACTIVE' && inv.order.status !== 'PAID') redirect(`/checkout/pay/${inv.order.reference}`);

  const content = contentOf(inv.content);
  const defs = sectionsFor(inv.occasion);
  const sections = defs.map((d) => ({
    key: d.key,
    label: sectionLabel(d.key, inv.occasion),
    description: d.description,
    unlocked: sectionUnlocked(d.key, inv.occasion, inv.tier),
    filled: sectionFilled(d.key, inv.occasion, content[d.key]),
    minTier: sectionMinTier(d.key, inv.occasion),
  }));
  const current = (sections.find((s) => s.key === section && s.unlocked)?.key ?? sections.find((s) => s.unlocked)!.key) as SectionKey;
  const fields = fieldsFor(current, inv.occasion);
  const initial = { ...emptySection(fields), ...(content[current] ?? {}) };
  const limit = galleryLimit(inv.tier);
  const editsLeft = inv.editsAllowed < 0 ? null : Math.max(0, inv.editsAllowed - inv.editsUsed);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
          <h1 className="display text-2xl">Builder <InvitationPill status={inv.status} /></h1>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/account/invitations/${inv.id}/settings`} className="btn btn-secondary btn-sm">Link & design</Link>
          <Link href={`/account/invitations/${inv.id}`} className="btn btn-primary btn-sm">{inv.status === 'PUBLISHED' ? 'Share' : 'Publish'}</Link>
        </div>
      </div>
      <Builder invitationId={inv.id} slug={inv.slug} status={inv.status} sections={sections} current={current} fields={fields} initial={initial} lang={inv.language === 'tl' ? 'tl' : 'en'} listLimits={{ photos: limit === Infinity ? 200 : limit }} editsLeft={editsLeft} />
    </>
  );
}
