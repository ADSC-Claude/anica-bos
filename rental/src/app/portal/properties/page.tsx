import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPesoShort, toCents } from '@/lib/money';
import { minutesToLabel } from '@/lib/datetime';
import { slugify, randomCode, secretToken } from '@/lib/codes';
import { audit } from '@/lib/audit';
import { Card, Empty, Notice, PageHeader, Pill, ReadyPill } from '@/components/ui';

export const metadata = { title: 'Properties' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = { DRAFT: 'muted', ACTIVE: 'ok', INACTIVE: 'warn' } as const;

async function createAction(formData: FormData) {
  'use server';
  const user = await requirePage('properties.create');
  const name = String(formData.get('name') ?? '').trim();
  const branchId = String(formData.get('branchId') ?? '');
  if (!name || !branchId) {
    redirect('/portal/properties?error=' + encodeURIComponent('A name and a branch are required.'));
  }

  let slug = slugify(name);
  if (await prisma.property.findUnique({ where: { slug } })) slug = `${slug}-${randomCode(3).toLowerCase()}`;

  const property = await prisma.property.create({
    data: {
      name,
      slug,
      code: `P-${randomCode(4)}`,
      branchId,
      type: String(formData.get('type') || 'CONDO') as never,
      // New properties start as drafts. A half-filled listing appearing on the
      // public site the moment it is named is nobody's intention.
      status: 'DRAFT',
      maxGuests: Number(formData.get('maxGuests') ?? 2),
      baseRateCents: toCents(String(formData.get('baseRate') || '0')),
      cleaningFeeCents: toCents(String(formData.get('cleaningFee') || '0')),
      city: String(formData.get('city') ?? ''),
      icalExportToken: secretToken(),
    },
  });

  await audit(user, {
    module: 'properties',
    action: 'create',
    entityType: 'Property',
    entityId: property.id,
    propertyId: property.id,
    summary: `Property created: ${name}`,
  });
  redirect(`/portal/properties/${property.id}?ok=${encodeURIComponent('Created as a draft — fill in the details, then publish.')}`);
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePage('properties.view');
  const sp = await searchParams;
  const mayCreate = can(user.role, 'properties.create');
  const propertyIds = await visibleProperties(user);

  const [properties, branches] = await Promise.all([
    prisma.property.findMany({
      where: propertyIds ? { id: { in: propertyIds } } : {},
      include: {
        branch: { select: { name: true } },
        _count: { select: { reservations: true, photos: true } },
      },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <PageHeader title="Properties" subtitle={`${properties.length} in the portfolio`} />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {properties.length === 0 ? (
          <Empty>No properties yet.</Empty>
        ) : (
          properties.map((p) => (
            <Card key={p.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/portal/properties/${p.id}`}
                    className="font-semibold hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-[color:var(--color-ink-500)]">
                    {p.city || '—'} · {p.branch.name} · {p.type.toLowerCase().replace('_', ' ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={STATUS_TONE[p.status]}>{p.status.toLowerCase()}</Pill>
                  <ReadyPill state={p.readyState} />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-1 text-xs">
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Base rate</dt>
                  <dd className="tabular-nums">{formatPesoShort(p.baseRateCents)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Cleaning fee</dt>
                  <dd className="tabular-nums">{formatPesoShort(p.cleaningFeeCents)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Sleeps</dt>
                  <dd>{p.maxGuests}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Check in / out</dt>
                  <dd>
                    {minutesToLabel(p.checkInMinute)} / {minutesToLabel(p.checkOutMinute)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Bookings</dt>
                  <dd>{p._count.reservations}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--color-ink-500)]">Photos</dt>
                  <dd className={p._count.photos === 0 ? 'text-[color:var(--bad)]' : ''}>
                    {p._count.photos}
                  </dd>
                </div>
              </dl>

              {p.status === 'ACTIVE' && (
                <Link
                  className="mt-3 inline-block text-xs underline"
                  href={`/stays/${p.slug}`}
                  target="_blank"
                >
                  See the public page
                </Link>
              )}
            </Card>
          ))
        )}
      </div>

      {mayCreate && (
        <Card title="Add a property">
          <form action={createAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Name *</span>
              <input className="field" name="name" required placeholder="Serenity Suite, BGC" />
            </label>
            <label className="block">
              <span className="label">Branch *</span>
              <select className="field" name="branchId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select className="field" name="type" defaultValue="CONDO">
                <option value="CONDO">Condo</option>
                <option value="APARTMENT">Apartment</option>
                <option value="HOUSE">House</option>
                <option value="VILLA">Villa</option>
                <option value="STUDIO">Studio</option>
                <option value="TOWNHOUSE">Townhouse</option>
              </select>
            </label>
            <label className="block">
              <span className="label">City</span>
              <input className="field" name="city" placeholder="Taguig" />
            </label>
            <label className="block">
              <span className="label">Sleeps</span>
              <input className="field" name="maxGuests" type="number" min="1" defaultValue="2" />
            </label>
            <label className="block">
              <span className="label">Base nightly rate</span>
              <input className="field" name="baseRate" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <label className="block">
              <span className="label">Cleaning fee</span>
              <input className="field" name="cleaningFee" type="number" step="0.01" min="0" defaultValue="0" />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <button className="btn btn-primary" type="submit">
                Create as a draft
              </button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
