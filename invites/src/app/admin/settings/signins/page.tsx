import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, BackLink } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Every sign-in attempt has been recorded since the first deploy — login()
 * writes a LoginEvent per attempt because the rolling 15-minute lockout counts
 * them. Nothing displayed them, so the record existed and could not be read,
 * which is the same as not having it when you want to know who was in the
 * admin at eleven at night.
 */

/** The stored reasons, in the words someone would use out loud. */
const REASONS: Record<string, string> = {
  unknown_email: 'No account with that email',
  bad_password: 'Wrong password',
  inactive: 'Account disabled',
  rate_limited: 'Blocked — too many attempts',
  signup: 'Account created',
};

export default async function SignInsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; failures?: string }>;
}) {
  await requireStaffPage('audit.view');
  const { q, failures } = await searchParams;

  const rows = await prisma.loginEvent.findMany({
    where: {
      ...(failures ? { success: false } : {}),
      ...(q
        ? { OR: [{ email: { contains: q, mode: 'insensitive' as const } }, { ip: { contains: q } }] }
        : {}),
    },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  return (
    <>
      <BackLink href="/admin/settings">Settings</BackLink>
      <PageHeader
        title="Sign-in history"
        subtitle="Every attempt on every account, successful or not, with the address it came from."
        actions={
          <Link href="/admin/settings/audit" className="btn btn-secondary btn-sm">
            Audit trail
          </Link>
        }
      />

      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Email or IP" className="field max-w-xs" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="failures" value="1" defaultChecked={Boolean(failures)} /> Failed only
        </label>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-[color:var(--color-ink-500)]">
          Nothing yet. Attempts appear here the moment somebody signs in.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Email</th>
                <th>Who</th>
                <th>Result</th>
                <th>From</th>
                <th>Browser</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.success ? '' : 'bg-[#fdf0dd]/40'}>
                  <td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</td>
                  <td className="text-xs">{r.email}</td>
                  <td className="text-xs">
                    {r.user ? (
                      <>
                        {r.user.name}
                        <br />
                        {r.user.role}
                      </>
                    ) : (
                      <span className="text-[color:var(--color-ink-500)]">—</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {r.success ? (
                      <span className="pill pill-ok">Signed in</span>
                    ) : (
                      <span className="pill pill-warn">Failed</span>
                    )}
                    {r.reason && (
                      <>
                        <br />
                        {REASONS[r.reason] ?? r.reason}
                      </>
                    )}
                  </td>
                  <td className="text-xs">{r.ip}</td>
                  <td className="max-w-[16rem] truncate text-xs" title={r.userAgent}>
                    {r.userAgent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
