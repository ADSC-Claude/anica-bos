import { notFound } from 'next/navigation';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { AppointmentForm } from '@/components/appointment-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit booking' };

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage('appointments.edit');
  const { id } = await params;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: { services: true, client: { select: { name: true } } },
  });
  if (!appt) notFound();
  const branchId = await resolveBranchId(user, appt.branchId);

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

  // datetime-local wants Manila wall-clock, so shift the UTC instant by +8h.
  const startLocal = new Date(appt.startAt.getTime() + 8 * 3600_000).toISOString().slice(0, 16);

  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit booking — ${appt.client.name}`} subtitle={appt.reference} />
      <AppointmentForm
        branchId={branchId}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          categoryName: s.category.name,
        }))}
        clients={clients}
        partners={partners}
        initial={{
          id: appt.id,
          clientId: appt.clientId,
          serviceIds: appt.services.map((s) => s.serviceId),
          startAtLocal: startLocal,
          employeeId: appt.services[0]?.employeeId ?? 'any',
          resourceId: appt.resourceId ?? 'any',
          notes: appt.notes,
          partnerId: appt.partnerId ?? '',
        }}
      />
    </div>
  );
}
