import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader, Alert } from '@/components/ui';
import { AppointmentForm } from '@/components/appointment-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New booking' };

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; walkIn?: string; branchId?: string }>;
}) {
  const user = await requirePage('appointments.edit');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const walkIn = params.walkIn === '1';

  const [services, clients, partners] = await Promise.all([
    prisma.service.findMany({
      where: { active: true },
      include: { category: { select: { name: true } } },
      orderBy: [{ category: { sortRank: 'asc' } }, { sortRank: 'asc' }],
    }),
    prisma.client.findMany({
      where: { branchId },
      select: { id: true, name: true, mobile: true, medicalUpdatedAt: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.partner.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={walkIn ? 'Walk-in booking' : 'New booking'}
        subtitle={
          walkIn
            ? 'Starts now with the next therapist in the rotation queue and the first free bed.'
            : 'Conflicts are blocked automatically — a therapist or room cannot be double-booked.'
        }
      />
      {walkIn && (
        <div className="mb-4">
          <Alert tone="info">
            Leave the therapist as &ldquo;Any available&rdquo; and the system picks the next in
            the rotation, based on today&apos;s time-in order.
          </Alert>
        </div>
      )}
      <AppointmentForm
        branchId={branchId}
        walkIn={walkIn}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          categoryName: s.category.name,
        }))}
        clients={clients}
        partners={partners}
        initial={{ clientId: params.clientId }}
      />
    </div>
  );
}
