/**
 * Live server-side authorization check: mints a real session cookie for each
 * role and hits protected endpoints over HTTP, proving the server refuses —
 * not just that the UI hides things.
 */
import { SignJWT } from 'jose';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3000';
const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

async function cookieFor(email: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = await new SignJWT({
    sub: u.id, email: u.email, name: u.name, role: u.role,
    branchId: u.branchId, mcp: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
  return `anica_session=${token}`;
}

type Expect = { path: string; expect: Record<string, 'allow' | 'deny'> };

const CHECKS: Expect[] = [
  { path: '/api/portal/export/pl?month=2026-07', expect: { RECEPTIONIST: 'deny', ADMIN: 'allow', OWNER: 'allow' } },
  { path: '/api/portal/export/payroll?periodId=none', expect: { RECEPTIONIST: 'deny' } },
  { path: '/api/portal/export/journal?source=SALES&month=2026-07', expect: { RECEPTIONIST: 'deny', OWNER: 'allow' } },
  { path: '/api/portal/export/commissions', expect: { RECEPTIONIST: 'deny', ADMIN: 'allow' } },
  { path: '/api/portal/audit-export', expect: { RECEPTIONIST: 'deny', ADMIN: 'deny', OWNER: 'allow' } },
  { path: '/api/portal/backup', expect: { RECEPTIONIST: 'deny', ADMIN: 'deny', OWNER: 'allow' } },
  { path: '/api/portal/export/daily-sales', expect: { RECEPTIONIST: 'allow', OWNER: 'allow' } },
  { path: '/api/portal/client-context', expect: { RECEPTIONIST: 'allow' } },
];

const PAGES: Expect[] = [
  { path: '/portal/finance/pl', expect: { RECEPTIONIST: 'deny', OWNER: 'allow' } },
  { path: '/portal/employees/payroll', expect: { RECEPTIONIST: 'deny', ADMIN: 'allow' } },
  { path: '/portal/employees/incentives', expect: { RECEPTIONIST: 'deny', ADMIN: 'deny', OWNER: 'allow' } },
  { path: '/portal/settings/users', expect: { RECEPTIONIST: 'deny', ADMIN: 'deny', OWNER: 'allow' } },
  { path: '/portal/settings/audit', expect: { RECEPTIONIST: 'deny', ADMIN: 'deny', OWNER: 'allow' } },
  { path: '/portal/reports/kpi', expect: { RECEPTIONIST: 'deny', ADMIN: 'allow' } },
  { path: '/portal/sales/pos', expect: { RECEPTIONIST: 'allow' } },
];

async function main() {
  const cookies: Record<string, string> = {
    OWNER: await cookieFor('owner@anicaspa.ph'),
    ADMIN: await cookieFor('manager@anicaspa.ph'),
    RECEPTIONIST: await cookieFor('reception@anicaspa.ph'),
  };

  let pass = 0;
  let fail = 0;

  console.log('── API endpoints (403 = server refuses) ──');
  for (const check of CHECKS) {
    for (const [role, want] of Object.entries(check.expect)) {
      const res = await fetch(BASE + check.path, {
        headers: { cookie: cookies[role] },
        redirect: 'manual',
      });
      const denied = res.status === 401 || res.status === 403;
      const ok = want === 'deny' ? denied : !denied;
      console.log(`  ${ok ? '✓' : '✗'} ${role.padEnd(13)} ${want.padEnd(5)} ${check.path} → ${res.status}`);
      ok ? pass++ : fail++;
    }
  }

  console.log('\n── Pages (redirect to /portal?denied= = server refuses) ──');
  for (const check of PAGES) {
    for (const [role, want] of Object.entries(check.expect)) {
      const res = await fetch(BASE + check.path, {
        headers: { cookie: cookies[role] },
        redirect: 'manual',
      });
      const location = res.headers.get('location') ?? '';
      const denied = res.status >= 300 && res.status < 400 && location.includes('denied');
      const ok = want === 'deny' ? denied : !denied;
      console.log(
        `  ${ok ? '✓' : '✗'} ${role.padEnd(13)} ${want.padEnd(5)} ${check.path} → ${res.status}${location ? ` ${location}` : ''}`,
      );
      ok ? pass++ : fail++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main();
