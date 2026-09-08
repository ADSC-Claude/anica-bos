import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireCustomerPage, ownInvitation } from '@/lib/guard';
import { HttpError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { contentOf, resolveTheme } from '@/lib/invitations';
import { hasFeature, TIER_LABELS } from '@/lib/tiers';
import { PALETTE_PRESETS } from '@/lib/theme';
import { LOOKS, looksFor } from '@/lib/looks';
import { displayHost } from '@/lib/app-url';
import { PageHeader } from '@/components/ui';
import { SettingsForm, ThemePicker, TemplatePicker } from './forms';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerPage();
  const inv = await ownInvitation(user, id).catch((e) => { if (e instanceof HttpError) notFound(); throw e; });
  const templates = await prisma.template.findMany({ where: { occasion: inv.occasion, published: true }, orderBy: { sortOrder: 'asc' } });
  const content = contentOf(inv.content);
  const theme = resolveTheme(inv.template, content, inv.tier);
  const allowed = templates.filter((t) => (hasFeature(inv.tier, 'templates.premium') || !t.premium) && (hasFeature(inv.tier, 'templates.any') || t.minTier === 'BASIC'));

  return (
    <>
      <Link href={`/account/invitations/${inv.id}`} className="text-sm text-[color:var(--color-plum-600)] hover:underline">← {inv.title}</Link>
      <PageHeader title="Link, privacy, language & design" subtitle={`${TIER_LABELS[inv.tier]} package`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Link & privacy</h2>
          <SettingsForm invitationId={inv.id} host={displayHost()} slug={inv.slug} title={inv.title} privacy={inv.privacy} language={inv.language} canCustomSlug={hasFeature(inv.tier, 'slug.custom')} canPassword={hasFeature(inv.tier, 'privacy.password')} hasPassword={Boolean(inv.passwordHash)} />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Colours &amp; fonts</h2>
          <ThemePicker invitationId={inv.id} palettes={PALETTE_PRESETS.map((p) => ({ key: p.key, label: p.label, palette: p.palette }))} looks={looksFor(inv.tier).map((l) => ({ key: l.key, name: l.name, tagline: l.tagline }))} allLooks={LOOKS.length} current={{ paletteKey: content.theme?.paletteKey ?? '', palette: theme.palette, lookKey: content.theme?.lookKey ?? '', mode: content.theme?.mode ?? 'day' }} tier={inv.tier} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-1 font-semibold">Template</h2>
          <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">Switching keeps everything you typed — only the layout and default colours change.</p>
          <TemplatePicker invitationId={inv.id} currentId={inv.templateId} templates={allowed.map((t) => ({ id: t.id, name: t.name, description: t.description, thumbnailUrl: t.thumbnailUrl, premium: t.premium, layout: t.layout }))} />
          {allowed.length < templates.length && <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">{templates.length - allowed.length} more design{templates.length - allowed.length === 1 ? '' : 's'} available on a higher tier. <Link href={`/account/invitations/${inv.id}/upgrade`} className="underline">See upgrade</Link></p>}
        </div>
      </div>
    </>
  );
}
