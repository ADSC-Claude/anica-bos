/**
 * Renders every page as each role and reports any that error.
 * Requires the app to be running on localhost:3000 and the seed to have been run.
 *
 *   npm run dev            # in one terminal
 *   npx tsx tests/live/pages-live.ts
 */
import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

async function cookieFor(email: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await new SignJWT({
    sub: u.id, email: u.email, name: u.name, role: u.role, branchId: u.branchId, mcp: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  return `anica_session=${token}`;
}

const PUBLIC_PAGES = ['/', '/book', '/login', '/offline'];

const PORTAL_PAGES = [
  '/portal',
  '/portal/notifications',
  '/portal/messages',
  '/portal/messages?tab=announcements',
  '/portal/messages?tab=logbook',
  '/portal/clients',
  '/portal/clients?filter=lapsed',
  '/portal/clients?filter=birthday',
  '/portal/clients/new',
  '/portal/clients/follow-ups',
  '/portal/clients/corporate',
  '/portal/clients/partners',
  '/portal/appointments',
  '/portal/appointments?view=week',
  '/portal/appointments?view=month',
  '/portal/appointments?view=list',
  '/portal/appointments/new',
  '/portal/sales',
  '/portal/sales/pos',
  '/portal/sales/petty-cash',
  '/portal/sales/eod',
  '/portal/employees',
  '/portal/employees/new',
  '/portal/employees/attendance',
  '/portal/employees/payroll',
  '/portal/employees/incentives',
  '/portal/inventory',
  '/portal/inventory/suppliers',
  '/portal/inventory/purchase-orders',
  '/portal/inventory/stock-take',
  '/portal/finance/pl',
  '/portal/finance/expenses',
  '/portal/finance/cashflow',
  '/portal/finance/receivables',
  '/portal/finance/journals',
  '/portal/marketing',
  '/portal/marketing/packages',
  '/portal/marketing/vouchers',
  '/portal/marketing/campaigns',
  '/portal/reports',
  '/portal/reports/kpi',
  '/portal/settings',
  '/portal/settings/services',
  '/portal/settings/resources',
  '/portal/settings/discounts',
  '/portal/settings/intake',
  '/portal/settings/operations',
  '/portal/settings/booking',
  '/portal/settings/payroll',
  '/portal/settings/tax',
  '/portal/settings/comms',
  '/portal/settings/kpi',
  '/portal/settings/permits',
  '/portal/settings/users',
  '/portal/settings/branches',
  '/portal/settings/audit',
  '/portal/settings/backup',
];

async function main() {
  let pass = 0;
  const failures: string[] = [];

  console.log('── Public pages ──');
  for (const path of PUBLIC_PAGES) {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    const ok = res.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} ${path} → ${res.status}`);
    ok ? pass++ : failures.push(`${path} → ${res.status}`);
  }

  const owner = await cookieFor('owner@anicaspa.ph');

  console.log('\n── Portal pages, as the Owner ──');
  for (const path of PORTAL_PAGES) {
    const res = await fetch(BASE + path, { headers: { cookie: owner }, redirect: 'manual' });
    const ok = res.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} ${path} → ${res.status}`);
    ok ? pass++ : failures.push(`${path} → ${res.status}`);
  }

  // Deep-linked detail pages built from real seeded records.
  const [client, appointment, sale, employee] = await Promise.all([
    prisma.client.findFirst(),
    prisma.appointment.findFirst({ where: { status: 'COMPLETED' } }),
    prisma.sale.findFirst({ where: { status: 'PAID' } }),
    prisma.employee.findFirst({ where: { employeeRole: 'THERAPIST' } }),
  ]);

  const detailPages = [
    client && `/portal/clients/${client.id}`,
    client && `/portal/clients/${client.id}?tab=medical`,
    client && `/portal/clients/${client.id}?tab=history`,
    appointment && `/portal/appointments/${appointment.id}`,
    appointment && `/portal/appointments/${appointment.id}/edit`,
    sale && `/portal/sales/${sale.id}`,
    employee && `/portal/employees/${employee.id}`,
    employee && `/portal/employees/${employee.id}?tab=loans`,
    sale && `/portal/sales/pos?appointmentId=${appointment?.id ?? ''}`,
  ].filter(Boolean) as string[];

  console.log('\n── Detail pages ──');
  for (const path of detailPages) {
    const res = await fetch(BASE + path, { headers: { cookie: owner }, redirect: 'manual' });
    const ok = res.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} ${path.slice(0, 70)} → ${res.status}`);
    ok ? pass++ : failures.push(`${path} → ${res.status}`);
  }

  console.log(`\n${pass} rendered, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f}`);
  }
  await prisma.$disconnect();
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
