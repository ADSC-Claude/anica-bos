import { handle, requireApi } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { medicalAlertsFor, recordMedicalAccess } from '@/lib/medical';
import { isBirthdayMonth } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

/**
 * Everything the POS needs the moment a client is selected: prepaid balances,
 * membership discount, birthday-perk eligibility, loyalty points, saved
 * PWD/Senior IDs, corporate links and health alerts.
 */
export const GET = handle(async (req) => {
  const user = await requireApi('pos.use');
  const clientId = new URL(req.url).searchParams.get('clientId');
  if (!clientId) return { client: null };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      packages: {
        where: { status: 'ACTIVE', expiresAt: { gte: new Date() } },
        include: { package: true, entitlements: true },
      },
      corporateLinks: { include: { account: { select: { id: true, name: true, active: true } } } },
    },
  });
  if (!client) return { client: null };

  const alerts = (await medicalAlertsFor([clientId])).get(clientId) ?? [];
  if (alerts.length) await recordMedicalAccess(user, clientId, 'alerts');
  const membership = client.packages.find((p) => p.package.type === 'MEMBERSHIP');
  const year = new Date().getUTCFullYear();

  const services = await prisma.service.findMany({
    where: {
      id: {
        in: client.packages.flatMap((p) => p.entitlements.map((e) => e.serviceId)),
      },
    },
    select: { id: true, name: true, priceCents: true },
  });
  const serviceById = new Map(services.map((s) => [s.id, s]));

  return {
    client: {
      id: client.id,
      name: client.name,
      mobile: client.mobile,
      loyaltyPoints: client.loyaltyPoints,
      pwdIdNumber: client.pwdIdNumber,
      seniorIdNumber: client.seniorIdNumber,
      incomplete: client.incomplete,
    },
    alerts,
    membership: membership
      ? {
          id: membership.id,
          name: membership.package.name,
          discountPercent: membership.package.memberDiscountPercent,
          expiresAt: membership.expiresAt,
          birthdayPerkServiceId: membership.package.birthdayPerkServiceId,
          birthdayPerkAvailable:
            Boolean(membership.package.birthdayPerkServiceId) &&
            isBirthdayMonth(client.birthday) &&
            membership.birthdayPerkUsedYear !== year,
        }
      : null,
    prepaid: client.packages
      .filter((p) => p.package.type === 'SESSION_PACKAGE')
      .flatMap((p) =>
        p.entitlements
          .filter((e) => e.totalSessions > e.usedSessions)
          .map((e) => ({
            clientPackageId: p.id,
            packageName: p.package.name,
            serviceId: e.serviceId,
            serviceName: serviceById.get(e.serviceId)?.name ?? 'Service',
            basePriceCents: serviceById.get(e.serviceId)?.priceCents ?? 0,
            remaining: e.totalSessions - e.usedSessions,
            expiresAt: p.expiresAt,
          })),
      ),
    corporateAccounts: client.corporateLinks
      .filter((l) => l.account.active)
      .map((l) => ({ id: l.account.id, name: l.account.name })),
    role: user.role,
  };
});
