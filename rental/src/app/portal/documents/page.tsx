import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatStayDate, daysUntil, toStayDate } from '@/lib/datetime';
import { storeFile } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

const CATEGORIES = [
  'PERMIT',
  'CONTRACT',
  'INSURANCE',
  'VENDOR_AGREEMENT',
  'RECEIPT',
  'INVOICE',
  'MAINTENANCE_RECORD',
  'COMPLIANCE',
  'OTHER',
];

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/documents?${kind}=${encodeURIComponent(message)}`);
}

async function uploadAction(formData: FormData) {
  'use server';
  const user = await requirePage('documents.edit');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) back('A name is required.', 'error');

  const propertyId = String(formData.get('propertyId') || '') || null;
  if (propertyId) await assertProperty(user, propertyId);

  const branchId = propertyId
    ? (await prisma.property.findUnique({ where: { id: propertyId }, select: { branchId: true } }))?.branchId ?? null
    : null;

  const expires = String(formData.get('expiresAt') || '');
  const issued = String(formData.get('issuedAt') || '');

  const doc = await prisma.document.create({
    data: {
      propertyId,
      branchId,
      name,
      category: String(formData.get('category') || 'PERMIT') as never,
      agency: String(formData.get('agency') ?? ''),
      refNumber: String(formData.get('refNumber') ?? ''),
      issuedAt: issued ? toStayDate(issued) : null,
      expiresAt: expires ? toStayDate(expires) : null,
      notes: String(formData.get('notes') ?? ''),
      uploadedById: user.id,
    },
  });

  // The scan is stored under the document's own id, and privately: a business
  // permit is not something to leave on a public bucket.
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    try {
      const stored = await storeFile({
        file,
        entityType: 'document',
        entityId: doc.id,
        visibility: 'private',
      });
      await prisma.document.update({
        where: { id: doc.id },
        data: { fileUrl: stored.url, storagePath: stored.storagePath },
      });
    } catch {
      back('Document recorded, but the file could not be read — attach it again.', 'error');
    }
  }

  await audit(user, {
    module: 'documents',
    action: 'create',
    entityType: 'Document',
    entityId: doc.id,
    propertyId,
    summary: `Document recorded: ${name}`,
    after: { name, expiresAt: expires || null },
  });
  back('Document recorded.');
}

async function deleteAction(formData: FormData) {
  'use server';
  const user = await requirePage('documents.edit');
  const id = String(formData.get('id'));
  const doc = await prisma.document.findUnique({ where: { id }, select: { name: true, propertyId: true } });
  if (!doc) back('That document no longer exists.', 'error');
  if (doc.propertyId) await assertProperty(user, doc.propertyId);

  await prisma.document.delete({ where: { id } });
  await audit(user, {
    module: 'documents',
    action: 'delete',
    entityType: 'Document',
    entityId: id,
    propertyId: doc.propertyId,
    summary: `Document deleted: ${doc.name}`,
    before: doc,
  });
  back('Deleted.');
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; category?: string }>;
}) {
  const user = await requirePage('documents.view');
  const sp = await searchParams;
  const mayEdit = can(user.role, 'documents.edit');
  const propertyIds = await visibleProperties(user);

  const [documents, properties] = await Promise.all([
    prisma.document.findMany({
      where: {
        ...(propertyIds ? { OR: [{ propertyId: { in: propertyIds } }, { propertyId: null }] } : {}),
        ...(sp.category ? { category: sp.category as never } : {}),
      },
      include: { property: { select: { name: true } }, uploadedBy: { select: { name: true } } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.property.findMany({
      where: propertyIds ? { id: { in: propertyIds } } : {},
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const expiring = documents.filter((d) => d.expiresAt && daysUntil(d.expiresAt) <= 60);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Permits, contracts, insurance — and how long each has left to run."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {expiring.length > 0 && (
        <Notice kind="error">
          {expiring.length} document{expiring.length === 1 ? '' : 's'} expire within 60 days. The
          daily job emails the owner at 60 and 30 days out, then weekly — this panel is not the only
          thing standing between you and a lapsed permit.
        </Notice>
      )}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select className="field w-auto" name="category" defaultValue={sp.category ?? ''}>
          <option value="">Every category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.toLowerCase().replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      <Card className="mb-4">
        {documents.length === 0 ? (
          <Empty>Nothing recorded.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-sand-200)] text-left text-xs uppercase text-[color:var(--color-ink-500)]">
                  <th className="py-2">Document</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Property</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Expires</th>
                  <th className="py-2">File</th>
                  {mayEdit && <th className="py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-sand-200)]">
                {documents.map((d) => {
                  const days = d.expiresAt ? daysUntil(d.expiresAt) : null;
                  return (
                    <tr key={d.id}>
                      <td className="py-2">
                        <div className="font-medium">{d.name}</div>
                        {d.agency && (
                          <div className="text-xs text-[color:var(--color-ink-500)]">{d.agency}</div>
                        )}
                      </td>
                      <td className="py-2 text-xs">{d.category.toLowerCase().replace(/_/g, ' ')}</td>
                      <td className="py-2 text-xs">
                        {d.property?.name ?? (
                          <span className="italic text-[color:var(--color-ink-500)]">
                            business-wide
                          </span>
                        )}
                      </td>
                      <td className="py-2 font-mono text-xs">{d.refNumber || '—'}</td>
                      <td className="py-2 text-xs">
                        {d.expiresAt ? (
                          <>
                            {formatStayDate(d.expiresAt)}
                            {days !== null && days <= 60 && (
                              <Pill tone={days <= 0 ? 'bad' : days <= 30 ? 'bad' : 'warn'}>
                                {days <= 0 ? 'expired' : `${days}d`}
                              </Pill>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {d.fileUrl ? (
                          <a className="underline" href={d.fileUrl} target="_blank" rel="noreferrer">
                            open
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      {mayEdit && (
                        <td className="py-2 text-right">
                          <form action={deleteAction}>
                            <input type="hidden" name="id" value={d.id} />
                            <button
                              className="text-xs text-[color:var(--bad)] hover:underline"
                              type="submit"
                            >
                              Delete
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
      </Card>

      {mayEdit && (
        <Card title="Record a document">
          <form action={uploadAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Name *</span>
              <input className="field" name="name" required placeholder="Business permit 2026" />
            </label>
            <label className="block">
              <span className="label">Category</span>
              <select className="field" name="category" defaultValue="PERMIT">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toLowerCase().replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Property</span>
              <select className="field" name="propertyId" defaultValue="">
                <option value="">Business-wide</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Issuing agency</span>
              <input className="field" name="agency" placeholder="City Hall" />
            </label>
            <label className="block">
              <span className="label">Reference number</span>
              <input className="field" name="refNumber" />
            </label>
            <label className="block">
              <span className="label">Issued</span>
              <input className="field" name="issuedAt" type="date" />
            </label>
            <label className="block">
              <span className="label">Expires</span>
              <input className="field" name="expiresAt" type="date" />
              <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
                Set this and the reminders take care of themselves.
              </span>
            </label>
            <label className="block">
              <span className="label">Scan or photo</span>
              <input
                className="field"
                name="file"
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="mb-3 block">
                <span className="label">Notes</span>
                <input className="field" name="notes" />
              </label>
              <button className="btn btn-primary" type="submit">
                Record
              </button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
