import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, formatPesoShort, toCents } from '@/lib/money';
import { formatStayDate, toStayDate, manilaDateKey } from '@/lib/datetime';
import { audit } from '@/lib/audit';
import { Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Marketing' };
export const dynamic = 'force-dynamic';

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/marketing?${kind}=${encodeURIComponent(message)}`);
}

function optionalDate(raw: FormDataEntryValue | null): Date | null {
  const value = String(raw ?? '').trim();
  return value ? toStayDate(value) : null;
}

async function createPromoAction(formData: FormData) {
  'use server';
  const user = await requirePage('marketing.edit');
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  const name = String(formData.get('name') ?? '').trim();
  if (!code || !name) back('A code and a name are required.', 'error');

  const existing = await prisma.promotion.findUnique({ where: { code } });
  if (existing) back(`${code} is already in use.`, 'error');

  const type = String(formData.get('type') || 'PERCENT') as 'PERCENT' | 'FIXED';
  // A percent is a whole number, a fixed amount is centavos. Storing both in
  // one column only works because the type is stored beside it.
  const rawValue = String(formData.get('value') || '0');
  const value = type === 'PERCENT' ? Math.round(Number(rawValue)) : toCents(rawValue);
  if (value <= 0) back('The discount must be more than zero.', 'error');
  if (type === 'PERCENT' && value > 100) back('A percentage discount cannot exceed 100.', 'error');

  const promo = await prisma.promotion.create({
    data: {
      code,
      name,
      description: String(formData.get('description') ?? ''),
      type,
      value,
      audience: String(formData.get('audience') || 'ALL') as never,
      minNights: Number(formData.get('minNights') ?? 1),
      staysFrom: optionalDate(formData.get('staysFrom')),
      staysTo: optionalDate(formData.get('staysTo')),
      bookableFrom: optionalDate(formData.get('bookableFrom')),
      bookableTo: optionalDate(formData.get('bookableTo')),
      maxRedemptions: Number(formData.get('maxRedemptions') ?? 0),
      autoApply: formData.get('autoApply') === 'on',
    },
  });

  await audit(user, {
    module: 'marketing',
    action: 'promotion.create',
    entityType: 'Promotion',
    entityId: promo.id,
    summary: `Promotion ${code} created`,
    after: { code, type, value },
  });
  back(`${code} is live.`);
}

async function togglePromoAction(formData: FormData) {
  'use server';
  const user = await requirePage('marketing.edit');
  const id = String(formData.get('id'));
  const promo = await prisma.promotion.findUnique({ where: { id }, select: { active: true, code: true } });
  if (!promo) back('That promotion no longer exists.', 'error');

  await prisma.promotion.update({ where: { id }, data: { active: !promo.active } });
  await audit(user, {
    module: 'marketing',
    action: promo.active ? 'promotion.disable' : 'promotion.enable',
    entityType: 'Promotion',
    entityId: id,
    summary: `Promotion ${promo.code} ${promo.active ? 'disabled' : 'enabled'}`,
  });
  back(`${promo.code} ${promo.active ? 'switched off' : 'switched on'}.`);
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePage('marketing.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'marketing.edit');
  const propertyIds = await visibleProperties(user);
  const today = manilaDateKey();

  const [promotions, campaigns, audience, lapsed] = await Promise.all([
    prisma.promotion.findMany({
      include: { _count: { select: { redeemed: true } } },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.campaign.findMany({
      include: { _count: { select: { recipients: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.guest.groupBy({
      by: ['tier'],
      where: { mergedIntoId: null, marketingConsent: true },
      _count: { _all: true },
    }),
    // Lapsed: a guest whose last stay is further back than their own usual gap,
    // which is a more useful signal than any fixed number of months.
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Guest"
      WHERE "mergedIntoId" IS NULL
        AND "marketingConsent" = true
        AND "lastStayAt" IS NOT NULL
        AND "avgGapDays" > 0
        AND "lastStayAt" < NOW() - ("avgGapDays" * INTERVAL '1 day')
    `,
  ]);

  const consenting = audience.reduce((sum, a) => sum + a._count._all, 0);
  const lapsedCount = Number(lapsed[0]?.count ?? 0);

  return (
    <>
      <PageHeader
        title="Marketing"
        subtitle="Promotions, and who may lawfully be sent one."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Promotions">
            {promotions.length === 0 ? (
              <Empty>No promotions yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                      <th className="py-2">Code</th>
                      <th className="py-2">Discount</th>
                      <th className="py-2">Who</th>
                      <th className="py-2">Stays</th>
                      <th className="py-2 text-right">Used</th>
                      <th className="py-2">State</th>
                      {mayEdit && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                    {promotions.map((p) => {
                      const expired = p.bookableTo && formatStayDate(p.bookableTo) < formatStayDate(toStayDate(today));
                      const exhausted = p.maxRedemptions > 0 && p.redemptions >= p.maxRedemptions;
                      return (
                        <tr key={p.id}>
                          <td className="py-2">
                            <span className="font-mono text-xs font-semibold">{p.code}</span>
                            <div className="text-xs text-[color:var(--color-ink-500)]">{p.name}</div>
                          </td>
                          <td className="py-2">
                            {p.type === 'PERCENT' ? `${p.value}%` : formatPeso(p.value)}
                            {p.autoApply && (
                              <span className="ml-1 text-[11px] text-[color:var(--color-clay-600)]">
                                auto
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-xs">{p.audience.toLowerCase()}</td>
                          <td className="py-2 text-xs">
                            {p.staysFrom ? formatStayDate(p.staysFrom) : 'any'} →{' '}
                            {p.staysTo ? formatStayDate(p.staysTo) : 'any'}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {p.redemptions}
                            {p.maxRedemptions > 0 ? ` / ${p.maxRedemptions}` : ''}
                          </td>
                          <td className="py-2">
                            {!p.active ? (
                              <Pill tone="muted">off</Pill>
                            ) : exhausted ? (
                              <Pill tone="warn">used up</Pill>
                            ) : expired ? (
                              <Pill tone="warn">expired</Pill>
                            ) : (
                              <Pill tone="ok">live</Pill>
                            )}
                          </td>
                          {mayEdit && (
                            <td className="py-2 text-right">
                              <form action={togglePromoAction}>
                                <input type="hidden" name="id" value={p.id} />
                                <button className="text-xs hover:underline" type="submit">
                                  {p.active ? 'Switch off' : 'Switch on'}
                                </button>
                              </form>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
              A promotion is resolved on the server at quote time, never from the browser, and the
              reason it did or did not apply is shown to the guest.
            </p>
          </Card>

          {mayEdit && (
            <Card title="New promotion">
              <form action={createPromoAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="label">Code *</span>
                  <input className="field font-mono uppercase" name="code" required placeholder="STAY3" />
                </label>
                <label className="block">
                  <span className="label">Name *</span>
                  <input className="field" name="name" required placeholder="Three nights, 10% off" />
                </label>
                <label className="block">
                  <span className="label">Type</span>
                  <select className="field" name="type" defaultValue="PERCENT">
                    <option value="PERCENT">Percent off</option>
                    <option value="FIXED">Fixed amount off</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Value *</span>
                  <input className="field" name="value" type="number" step="0.01" min="0" required />
                  <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                    Whole percent, or an amount in pesos.
                  </span>
                </label>
                <label className="block">
                  <span className="label">Who it is for</span>
                  <select className="field" name="audience" defaultValue="ALL">
                    <option value="ALL">Everyone</option>
                    <option value="NEW">New guests</option>
                    <option value="REPEAT">Repeat guests</option>
                    <option value="VIP">VIP guests</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Minimum nights</span>
                  <input className="field" name="minNights" type="number" min="1" defaultValue="1" />
                </label>
                <label className="block">
                  <span className="label">Stays from</span>
                  <input className="field" name="staysFrom" type="date" />
                </label>
                <label className="block">
                  <span className="label">Stays to</span>
                  <input className="field" name="staysTo" type="date" />
                </label>
                <label className="block">
                  <span className="label">Bookable until</span>
                  <input className="field" name="bookableTo" type="date" />
                </label>
                <label className="block">
                  <span className="label">Maximum uses</span>
                  <input className="field" name="maxRedemptions" type="number" min="0" defaultValue="0" />
                  <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                    Zero means unlimited.
                  </span>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input type="checkbox" name="autoApply" />
                  <span className="text-sm">Apply without a code</span>
                </label>
                <div className="sm:col-span-2 lg:col-span-3">
                  <button className="btn btn-primary" type="submit">
                    Create
                  </button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Campaigns">
            {campaigns.length === 0 ? (
              <Empty>
                No campaigns sent. The audience below is the one a campaign may draw from.
              </Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {campaigns.map((c) => (
                  <li key={c.id} className="flex justify-between">
                    <span>
                      {c.name}
                      <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">
                        {c.subject}
                      </span>
                    </span>
                    <span className="text-xs text-[color:var(--color-ink-500)]">
                      {c.sentAt ? `${c.sentCount} sent` : `${c._count.recipients} queued`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Who may be contacted">
            <p className="mb-3 text-sm">
              <span className="text-2xl font-bold">{consenting}</span>{' '}
              <span className="text-[color:var(--color-ink-500)]">
                guest{consenting === 1 ? '' : 's'} have opted in
              </span>
            </p>
            <ul className="space-y-1 text-sm">
              {audience.map((a) => (
                <li key={a.tier} className="flex justify-between">
                  <span>{a.tier.toLowerCase()}</span>
                  <span className="tabular-nums">{a._count._all}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
              Consent is a column on the guest, and every audience query filters on it. Nobody
              without it can be added to a campaign, whatever the campaign says.
            </p>
            <Link className="btn btn-secondary mt-3" href="/portal/guests?consent=yes">
              See them
            </Link>
          </Card>

          <Card title="Worth a nudge">
            <p className="text-sm">
              <span className="text-2xl font-bold">{lapsedCount}</span>{' '}
              <span className="text-[color:var(--color-ink-500)]">
                opted-in guest{lapsedCount === 1 ? '' : 's'} are overdue a return
              </span>
            </p>
            <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
              Overdue against their own rhythm — last stay longer ago than the average gap between
              their stays — rather than a fixed number of months, which flatters the frequent guest
              and forgets the annual one.
            </p>
          </Card>

          <Card title="Value of promotions used">
            <PromoValue />
          </Card>
        </div>
      </div>
    </>
  );
}

async function PromoValue() {
  const redemptions = await prisma.promotionRedemption.aggregate({
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const total = redemptions._sum.amountCents ?? 0;
  return (
    <p className="text-sm">
      <span className="text-2xl font-bold">{formatPesoShort(total)}</span>
      <span className="ml-2 text-[color:var(--color-ink-500)]">
        given away across {redemptions._count._all} booking
        {redemptions._count._all === 1 ? '' : 's'}
      </span>
    </p>
  );
}
