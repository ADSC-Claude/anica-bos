/**
 * The permission matrix, proved over real HTTP.
 *
 * `tests/rbac.test.ts` proves `can()` returns the right answer. That is not the
 * same claim as "the server refuses". This script signs in as each role against
 * a running instance and asks for every page, checking that what the matrix
 * forbids comes back as a redirect to somewhere else — not as a rendered page
 * with the buttons merely hidden.
 *
 * It is a script rather than a unit test because it needs a server. Run:
 *
 *   npm run build:local && npm start &        # or npm run dev
 *   npm run test:live
 */

import { PrismaClient, type Role } from '@prisma/client';
import { SignJWT } from 'jose';

const BASE = process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:3000';

const prisma = new PrismaClient();

/** Page → the permission it declares. Kept beside the routes, not derived. */
const PAGES: { path: string; permission: string }[] = [
  { path: '/portal', permission: 'dashboard.view' },
  { path: '/portal/calendar', permission: 'calendar.view' },
  { path: '/portal/reservations', permission: 'reservations.view' },
  { path: '/portal/guests', permission: 'guests.view' },
  { path: '/portal/tasks', permission: 'tasks.view' },
  { path: '/portal/cleaning', permission: 'cleaning.view' },
  { path: '/portal/maintenance', permission: 'maintenance.view' },
  { path: '/portal/incidents', permission: 'incidents.view' },
  { path: '/portal/inventory', permission: 'inventory.view' },
  { path: '/portal/finance', permission: 'finance.view' },
  { path: '/portal/reports', permission: 'reports.view' },
  { path: '/portal/reviews', permission: 'reviews.view' },
  { path: '/portal/marketing', permission: 'marketing.view' },
  { path: '/portal/documents', permission: 'documents.view' },
  { path: '/portal/properties', permission: 'properties.view' },
  { path: '/portal/settings', permission: 'settings.view' },
  { path: '/portal/settings/users', permission: 'users.manage' },
  { path: '/portal/settings/audit', permission: 'audit.view' },
];

const ACCOUNTS: { email: string; role: Role }[] = [
  { email: 'owner@anicastays.ph', role: 'OWNER' },
  { email: 'manager@anicastays.ph', role: 'MANAGER' },
  { email: 'desk@anicastays.ph', role: 'RESERVATIONS' },
  { email: 'books@anicastays.ph', role: 'ACCOUNTANT' },
  { email: 'ana@anicastays.ph', role: 'CLEANER' },
  { email: 'inspect@anicastays.ph', role: 'INSPECTOR' },
  { email: 'fix@anicastays.ph', role: 'MAINTENANCE' },
];

/**
 * Mints the same cookie `createSession` would. Sign-in itself is a Server
 * Action, which is not something to drive over raw fetch — and the thing under
 * test here is the guard, not the login form. If the claims below ever drift
 * from `lib/auth.ts`, every check fails at once rather than passing quietly,
 * which is the failure mode to want.
 */
async function signIn(email: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET is missing or too short.');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`${email}: no such account — has the seed been run?`);

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    mcp: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));

  return `stays_session=${token}`;
}

async function get(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') ?? '' };
}

async function main() {
  const { can } = await import('../../src/lib/rbac.js');

  let checked = 0;
  const failures: string[] = [];

  for (const account of ACCOUNTS) {
    const cookie = await signIn(account.email);

    for (const page of PAGES) {
      const allowed = can(account.role, page.permission as never);
      const { status, location } = await get(page.path, cookie);
      checked++;

      // A permitted page renders (200). A forbidden one must redirect away —
      // a 200 here would mean the server served it and only the UI hid things.
      const served = status === 200;
      if (allowed && !served) {
        failures.push(`${account.role} SHOULD see ${page.path} — got ${status} ${location}`);
      }
      if (!allowed && served) {
        failures.push(`${account.role} MUST NOT see ${page.path} — it rendered`);
      }
      if (!allowed && served === false && !location.includes('denied') && status !== 307 && status !== 302) {
        failures.push(`${account.role} on ${page.path}: unexpected ${status}`);
      }
    }

    // And the CSV export, which is a second permission beyond reading a report.
    const csv = await get('/api/reports/revenue.csv', cookie);
    checked++;
    const mayExport = can(account.role, 'finance.export' as never);
    if (mayExport && csv.status !== 200) {
      failures.push(`${account.role} SHOULD export CSV — got ${csv.status}`);
    }
    if (!mayExport && csv.status === 200) {
      failures.push(`${account.role} MUST NOT export CSV — it downloaded`);
    }
  }

  // Signed out, the portal is closed.
  const anonymous = await get('/portal', '');
  checked++;
  if (anonymous.status === 200) failures.push('an unauthenticated request rendered /portal');

  console.log(`\n  ${checked} checks over HTTP against ${BASE}\n`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`\n✗ ${failures.length} of ${checked} failed.\n`);
    process.exitCode = 1;
  } else {
    console.log('✓ Every role sees exactly what the matrix says it may, and nothing else.\n');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
