/**
 * Checks that the data reconciles with itself. Run after the seed in CI and
 * any time something looks off in production.
 */
import { PrismaClient } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/db-url';

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.info(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  console.info('Verifying…');
  const orders = await prisma.order.findMany({ include: { items: true, payments: true } });
  check('every order total equals the sum of its items', orders.every((o) => o.items.reduce((a, i) => a + i.amountCents, 0) === o.totalCents), `${orders.length} orders`);
  check('every ACTIVE order has a PAID payment or a zero total', orders.filter((o) => o.status === 'ACTIVE').every((o) => o.totalCents === 0 || o.payments.some((p) => p.status === 'PAID')));
  check('no PENDING_PAYMENT order has a PAID payment', orders.filter((o) => o.status === 'PENDING_PAYMENT').every((o) => !o.payments.some((p) => p.status === 'PAID')));

  const dfyOrders = orders.filter((o) => o.serviceMode !== 'DIY' && o.status === 'ACTIVE');
  const jobs = await prisma.dfyJob.findMany();
  check('every active DFY order has a job', dfyOrders.every((o) => jobs.some((j) => j.orderId === o.id)), `${dfyOrders.length} orders, ${jobs.length} jobs`);

  const guests = await prisma.guest.findMany({ select: { token: true } });
  check('guest tokens are unique and long', new Set(guests.map((g) => g.token)).size === guests.length && guests.every((g) => g.token.length >= 20), `${guests.length} guests`);

  const published = await prisma.invitation.findMany({ where: { status: 'PUBLISHED' } });
  check('published invitations have an expiry', published.every((i) => i.expiresAt !== null), `${published.length} published`);
  const slugs = await prisma.invitation.findMany({ select: { slug: true } });
  check('slugs are url-safe', slugs.every((s) => /^[a-z0-9-]+$/.test(s.slug)));

  const rsvps = await prisma.rsvp.findMany({ include: { guest: true } });
  check('personal-link RSVPs never exceed the allotment (+1)', rsvps.filter((r) => r.guest).every((r) => r.seats <= r.guest!.seatsAllotted + (r.guest!.plusOneAllowed ? 1 : 0)));

  const packages = await prisma.package.findMany({ where: { active: true } });
  for (const tier of ['BASIC', 'STANDARD', 'COMPLETE'] as const) {
    check(`a generic ${tier} package exists`, packages.some((p) => p.occasion === null && p.tier === tier));
  }

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.info('\nAll good.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
