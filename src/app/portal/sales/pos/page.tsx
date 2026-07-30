import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { manilaDateKey, dateKeyToBusinessDate } from '@/lib/datetime';
import { Alert } from '@/components/ui';
import { PosTerminal } from './terminal';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'POS checkout' };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ appointmentId?: string; clientId?: string; branchId?: string }>;
}) {
  const user = await requirePage('pos.use');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);

  const dayClosed = await prisma.eodClosing.findUnique({
    where: {
      branchId_businessDate: {
        branchId,
        businessDate: dateKeyToBusinessDate(manilaDateKey()),
      },
    },
    select: { id: true },
  });

  const [services, items, presets, clients, packages, therapists, corporates, partners] =
    await Promise.all([
      prisma.service.findMany({
        where: { active: true },
        include: { category: { select: { name: true, sortRank: true } } },
        orderBy: [{ category: { sortRank: 'asc' } }, { sortRank: 'asc' }],
      }),
      prisma.item.findMany({
        where: { branchId, archived: false, sellable: true },
        orderBy: { name: 'asc' },
      }),
      prisma.discountPreset.findMany({ where: { active: true }, orderBy: { sortRank: 'asc' } }),
      prisma.client.findMany({
        where: { branchId },
        select: { id: true, name: true, mobile: true },
        orderBy: { name: 'asc' },
        take: 800,
      }),
      prisma.package.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.employee.findMany({
        where: { branchId, active: true, employeeRole: 'THERAPIST' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.corporateAccount.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.partner.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

  // Pre-load an appointment handed off from the calendar.
  const appointment = params.appointmentId
    ? await prisma.appointment.findUnique({
        where: { id: params.appointmentId },
        include: {
          client: { select: { id: true, name: true } },
          services: { include: { service: true } },
        },
      })
    : null;

  return (
    <div>
      {dayClosed && (
        <div className="mb-4">
          <Alert tone="danger">
            Today has already been closed (EOD). New sales are blocked until the Owner or
            Manager reopens the day.
          </Alert>
        </div>
      )}
      <PosTerminal
        branchId={branchId}
        canApproveOwnDiscount={user.role !== 'RECEPTIONIST'}
        discountApprovalPercent={settings['pos.discountApprovalPercent']}
        tipsEnabled={settings['pos.tipsEnabled']}
        loyaltyPointValueCents={settings['loyalty.pointValueCents']}
        taxRegime={settings['tax.regime']}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          priceCents: s.priceCents,
          categoryName: s.category.name,
        }))}
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          priceCents: i.retailPriceCents,
          stockQty: i.stockQty,
        }))}
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          priceCents: p.priceCents,
          type: p.type,
        }))}
        presets={presets.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          value: p.value,
          stackable: p.stackable,
          requiresId: p.requiresId,
          membersOnly: p.membersOnly,
          isEmployeeRate: p.isEmployeeRate,
        }))}
        clients={clients}
        therapists={therapists}
        corporates={corporates}
        partners={partners}
        prefill={
          appointment
            ? {
                appointmentId: appointment.id,
                clientId: appointment.clientId,
                clientName: appointment.client.name,
                depositCents:
                  appointment.depositStatus === 'PAID' && !appointment.depositAppliedSaleId
                    ? appointment.depositPaidCents
                    : 0,
                lines: appointment.services.map((s) => ({
                  serviceId: s.serviceId,
                  name: s.service.name,
                  priceCents: s.priceCents,
                  employeeId: s.employeeId ?? '',
                })),
              }
            : params.clientId
              ? { clientId: params.clientId }
              : undefined
        }
        blocked={Boolean(dayClosed)}
      />
    </div>
  );
}
