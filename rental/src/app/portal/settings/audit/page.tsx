import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { ROLE_LABELS } from '@/lib/rbac';
import { BackLink, Card, Empty, PageHeader, Pill } from '@/components/ui';

export const metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

/**
 * The audit trail, on screen. Nothing here writes: every mutation in the
 * system already goes through audit() and every sign-in attempt is already a
 * LoginEvent row, so this page only reads what the rest of the application
 * has been recording all along. Owner-only — it is the room with the CCTV
 * monitors in it, and it shows staff IP addresses and failed passwords'
 * emails, which are nobody else's business.
 */

const PAGE_SIZE = 50;

const REASON_LABELS: Record<string, string> = {
  bad_password: 'wrong password',
  unknown_email: 'unknown email',
  inactive: 'account disabled',
  rate_limited: 'rate limited',
};

/** "Chrome · Windows" beats 140 characters of user-agent nobody reads. */
function device(ua: string): string {
  if (!ua) return '';
  const browser = ua.includes('Edg/')
    ? 'Edge'
    : ua.includes('OPR/')
      ? 'Opera'
      : ua.includes('Chrome/')
        ? 'Chrome'
        : ua.includes('Firefox/')
          ? 'Firefox'
          : ua.includes('Safari/')
            ? 'Safari'
            : 'other browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : ua.includes('Android')
      ? 'Android'
      : ua.includes('Mac OS X')
        ? 'Mac'
        : ua.includes('Windows')
          ? 'Windows'
          : ua.includes('Linux')
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || (k === 'page' && Number(v) <= 0)) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role.toLowerCase();
}

function Pager({
  page,
  hasMore,
  params,
}: {
  page: number;
  hasMore: boolean;
  params: Record<string, string | undefined>;
}) {
  if (page <= 0 && !hasMore) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 0 ? (
        <Link className="hover:underline" href={`/portal/settings/audit${qs({ ...params, page: page - 1 })}`}>
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      {hasMore && (
        <Link className="hover:underline" href={`/portal/settings/audit${qs({ ...params, page: page + 1 })}`}>
          Older →
        </Link>
      )}
    </div>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    who?: string;
    module?: string;
    sensitive?: string;
    outcome?: string;
    page?: string;
  }>;
}) {
  await requirePage('audit.view');
  const sp = await searchParams;
  const tab = sp.tab === 'signins' ? 'signins' : 'actions';
  const page = Math.max(0, Number.parseInt(sp.page ?? '0', 10) || 0);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [actions7, signins7, failed7] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.loginEvent.count({ where: { createdAt: { gte: weekAgo }, success: true } }),
    prisma.loginEvent.count({ where: { createdAt: { gte: weekAgo }, success: false } }),
  ]);

  return (
    <>
      <BackLink href="/portal/settings">Settings</BackLink>
      <PageHeader
        title="Activity"
        subtitle="Everything done in the system and every sign-in attempt, newest first. The system writes these lines itself; nobody — owner included — can edit or delete one."
      />

      <p className="mb-4 text-sm text-[color:var(--color-ink-500)]">
        Last 7 days: {actions7} action{actions7 === 1 ? '' : 's'} · {signins7} sign-in
        {signins7 === 1 ? '' : 's'} ·{' '}
        <span className={failed7 > 0 ? 'font-medium text-[color:var(--color-clay-600)]' : ''}>
          {failed7} failed attempt{failed7 === 1 ? '' : 's'}
        </span>
      </p>

      <div className="mb-4 flex gap-2">
        <Link href="/portal/settings/audit" className={tab === 'actions' ? 'btn btn-primary' : 'btn btn-secondary'}>
          Actions
        </Link>
        <Link
          href="/portal/settings/audit?tab=signins"
          className={tab === 'signins' ? 'btn btn-primary' : 'btn btn-secondary'}
        >
          Sign-ins
        </Link>
      </div>

      {tab === 'actions' ? <ActionsTab sp={sp} page={page} /> : <SignInsTab sp={sp} page={page} />}
    </>
  );
}

async function ActionsTab({
  sp,
  page,
}: {
  sp: { who?: string; module?: string; sensitive?: string };
  page: number;
}) {
  const where = {
    ...(sp.who ? { userId: sp.who } : {}),
    ...(sp.module ? { module: sp.module } : {}),
    ...(sp.sensitive === '1' ? { sensitive: true } : {}),
  };

  const [rows, people, modules] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // One extra row is the cheapest possible "is there another page".
      take: PAGE_SIZE + 1,
      skip: page * PAGE_SIZE,
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const visible = rows.slice(0, PAGE_SIZE);
  const filtered = Boolean(sp.who || sp.module || sp.sensitive);

  return (
    <Card>
      <form action="/portal/settings/audit" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="label">Person</span>
          <select className="field" name="who" defaultValue={sp.who ?? ''}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Module</span>
          <select className="field" name="module" defaultValue={sp.module ?? ''}>
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m.module} value={m.module}>
                {m.module}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5 text-sm">
          <input type="checkbox" name="sensitive" value="1" defaultChecked={sp.sensitive === '1'} />
          <span>Sensitive only</span>
        </label>
        <div className="flex items-center gap-3 pt-4">
          <button className="btn btn-secondary" type="submit">
            Filter
          </button>
          {filtered && (
            <Link className="text-sm hover:underline" href="/portal/settings/audit">
              Clear
            </Link>
          )}
        </div>
      </form>

      {visible.length === 0 ? (
        <Empty>{filtered ? 'Nothing recorded for this filter.' : 'Nothing recorded yet.'}</Empty>
      ) : (
        <ul className="divide-y divide-[color:var(--color-sand-200)]">
          {visible.map((r) => {
            const hasDiff = r.before !== null || r.after !== null;
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs tabular-nums text-[color:var(--color-ink-500)]">
                    {formatManila(r.createdAt, { time: true })}
                  </span>
                  <span className="text-sm font-medium">{r.userName}</span>
                  <Pill tone={r.role === 'SYSTEM' ? 'muted' : 'info'}>{roleLabel(r.role)}</Pill>
                  {r.sensitive && <Pill tone="warn">sensitive</Pill>}
                </div>
                <p className="mt-1 text-sm">{r.summary || `${r.module}.${r.action} — ${r.entityType}`}</p>
                <p className="mt-0.5 text-xs text-[color:var(--color-ink-500)]">
                  {/* Only opaque ids get shortened; "The business" stays whole. */}
                  {r.module}.{r.action} · {r.entityType}
                  {r.entityId ? ` ${r.entityId.length > 20 ? r.entityId.slice(0, 8) + '…' : r.entityId}` : ''}
                  {r.ip && r.ip !== 'unknown' ? ` · from ${r.ip}` : ''}
                </p>
                {hasDiff && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-[color:var(--color-ink-500)] hover:underline">
                      What changed
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {r.before !== null && (
                        <div>
                          <p className="label">Before</p>
                          <pre className="overflow-x-auto rounded bg-[color:var(--color-sand-100)] p-2 text-xs">
                            {JSON.stringify(r.before, null, 2)}
                          </pre>
                        </div>
                      )}
                      {r.after !== null && (
                        <div>
                          <p className="label">After</p>
                          <pre className="overflow-x-auto rounded bg-[color:var(--color-sand-100)] p-2 text-xs">
                            {JSON.stringify(r.after, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={page} hasMore={hasMore} params={{ who: sp.who, module: sp.module, sensitive: sp.sensitive }} />
    </Card>
  );
}

async function SignInsTab({ sp, page }: { sp: { outcome?: string }; page: number }) {
  const where =
    sp.outcome === 'ok' ? { success: true } : sp.outcome === 'failed' ? { success: false } : {};

  const events = await prisma.loginEvent.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    skip: page * PAGE_SIZE,
  });
  const hasMore = events.length > PAGE_SIZE;
  const visible = events.slice(0, PAGE_SIZE);

  return (
    <Card>
      <form action="/portal/settings/audit" className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="signins" />
        <label className="block">
          <span className="label">Show</span>
          <select className="field" name="outcome" defaultValue={sp.outcome ?? ''}>
            <option value="">Everything</option>
            <option value="ok">Successful only</option>
            <option value="failed">Failed only</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      {visible.length === 0 ? (
        <Empty>No sign-ins recorded{sp.outcome ? ' for this filter' : ' yet'}.</Empty>
      ) : (
        <ul className="divide-y divide-[color:var(--color-sand-200)]">
          {visible.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-3">
              <span className="text-xs tabular-nums text-[color:var(--color-ink-500)]">
                {formatManila(e.createdAt, { time: true })}
              </span>
              <span className="text-sm font-medium">{e.user?.name ?? e.email}</span>
              {e.user && <span className="text-xs text-[color:var(--color-ink-500)]">{e.email}</span>}
              {e.success ? (
                <Pill tone="ok">signed in</Pill>
              ) : (
                <Pill tone="bad">{REASON_LABELS[e.reason] ?? 'failed'}</Pill>
              )}
              <span className="text-xs text-[color:var(--color-ink-500)]">
                {e.ip && e.ip !== 'unknown' ? `from ${e.ip}` : ''}
                {device(e.userAgent) ? `${e.ip && e.ip !== 'unknown' ? ' · ' : ''}${device(e.userAgent)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Pager page={page} hasMore={hasMore} params={{ tab: 'signins', outcome: sp.outcome }} />
    </Card>
  );
}
