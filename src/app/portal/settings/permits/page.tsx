import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { formatManila, daysUntil } from '@/lib/datetime';
import { PageHeader, StatCard, StatusBadge, EmptyState } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { PermitForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Permits & certificates' };

function statusFor(expiry: Date | null): { tone: 'OK' | 'WARN' | 'BAD'; label: string } {
  if (!expiry) return { tone: 'OK', label: 'no expiry' };
  const days = daysUntil(expiry);
  if (days < 0) return { tone: 'BAD', label: `expired ${-days}d ago` };
  if (days <= 60) return { tone: 'WARN', label: `${days}d left` };
  return { tone: 'OK', label: `${days}d left` };
}

export default async function PermitsPage() {
  const user = await requirePage('settings.view');

  const [permits, employees] = await Promise.all([
    prisma.permit.findMany({
      include: { employee: { select: { name: true } } },
      orderBy: [{ expiryDate: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const expired = permits.filter((p) => p.expiryDate && daysUntil(p.expiryDate) < 0);
  const expiring = permits.filter(
    (p) => p.expiryDate && daysUntil(p.expiryDate) >= 0 && daysUntil(p.expiryDate) <= 60,
  );

  return (
    <div>
      <PageHeader
        title="Permits &amp; certifications"
        subtitle="Compliance at a glance. Reminders go out 60 and 30 days before expiry, then weekly."
      />
      <SettingsNav role={user.role} current="/portal/settings/permits" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tracked" value={String(permits.length)} />
        <StatCard label="Expiring within 60 days" value={String(expiring.length)} tone={expiring.length ? 'warn' : 'good'} />
        <StatCard label="Expired" value={String(expired.length)} tone={expired.length ? 'bad' : 'good'} />
        <StatCard
          label="Compliance"
          value={expired.length ? 'Action needed' : expiring.length ? 'Renew soon' : 'All good'}
          tone={expired.length ? 'bad' : expiring.length ? 'warn' : 'good'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          {permits.length === 0 ? (
            <EmptyState title="No permits recorded yet" />
          ) : (
            <div className="card table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Permit / certificate</th>
                    <th>Agency</th>
                    <th>Reference</th>
                    <th>Holder</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p) => {
                    const st = statusFor(p.expiryDate);
                    return (
                      <tr key={p.id} className={st.tone === 'BAD' ? 'bg-clay-500/5' : ''}>
                        <td className="font-medium text-moss-800">
                          {p.name}
                          {p.fileUrl && (
                            <a href={p.fileUrl} target="_blank" rel="noreferrer"
                              className="ml-2 text-xs text-moss-500 underline underline-offset-4">
                              scan
                            </a>
                          )}
                        </td>
                        <td className="text-xs text-moss-500">{p.agency || '—'}</td>
                        <td className="num text-xs">{p.refNumber || '—'}</td>
                        <td className="text-xs">{p.employee?.name ?? 'Business'}</td>
                        <td className="text-xs">{p.expiryDate ? formatManila(p.expiryDate) : '—'}</td>
                        <td><StatusBadge status={st.tone} label={st.label} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <PermitForm
          permits={permits.map((p) => ({
            id: p.id,
            name: p.name,
            agency: p.agency,
            refNumber: p.refNumber,
            issueDate: p.issueDate?.toISOString().slice(0, 10) ?? '',
            expiryDate: p.expiryDate?.toISOString().slice(0, 10) ?? '',
            fileUrl: p.fileUrl,
            notes: p.notes,
            employeeId: p.employeeId ?? '',
          }))}
          employees={employees}
        />
      </div>
    </div>
  );
}
