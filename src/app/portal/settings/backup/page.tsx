import Link from 'next/link';
import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader, StatCard, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Backup & export' };

const TABLE_EXPORTS = [
  { key: 'clients', label: 'Clients' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'daily-sales', label: 'Sales (today)' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'stock-movements', label: 'Stock movements' },
  { key: 'purchases', label: 'Purchase orders' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'commissions', label: 'Commissions' },
];

export default async function BackupPage() {
  const user = await requirePage('settings.critical');

  const [sales, clients, auditEntries, oldestSale] = await Promise.all([
    prisma.sale.count(),
    prisma.client.count(),
    prisma.auditLog.count(),
    prisma.sale.findFirst({ orderBy: { businessDate: 'asc' }, select: { businessDate: true } }),
  ]);

  return (
    <div>
      <PageHeader title="Backup &amp; export" subtitle="Your data, in your hands, whenever you want it." />
      <SettingsNav role={user.role} current="/portal/settings/backup" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receipts on file" value={String(sales)} />
        <StatCard label="Client records" value={String(clients)} />
        <StatCard label="Audit entries" value={String(auditEntries)} />
        <StatCard
          label="Records since"
          value={oldestSale ? oldestSale.businessDate.toISOString().slice(0, 10) : '—'}
          hint="retained for 10 years"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-pad">
          <h2 className="section-title mb-2">Full backup</h2>
          <p className="muted mb-3">
            Every table as a single JSON file. This is the <strong>only</strong> export that
            includes client health information, so store it securely.
          </p>
          <Link href="/api/portal/backup" className="btn-primary">
            ↓ Download full backup (JSON)
          </Link>
          <div className="mt-4">
            <Alert tone="info">
              <p className="font-semibold">Restoring</p>
              <p className="mt-1">
                On a machine with the project checked out:
                <code className="mt-1 block rounded bg-white/60 px-2 py-1">
                  npm run restore -- ./anica-backup-YYYY-MM-DD.json
                </code>
                It refuses to run against a database that already has data unless you pass{' '}
                <code>--force</code>. Full steps are in the README.
              </p>
            </Alert>
          </div>
        </div>

        <div className="card-pad">
          <h2 className="section-title mb-2">Per-table CSV exports</h2>
          <p className="muted mb-3">
            Open directly in Excel or Google Sheets. Health information is excluded from these.
          </p>
          <ul className="space-y-1">
            {TABLE_EXPORTS.map((t) => (
              <li key={t.key}>
                <Link
                  href={`/api/portal/export/${t.key}`}
                  className="block rounded-lg px-2 py-1.5 text-sm text-moss-700 hover:bg-sand-100"
                >
                  ↓ {t.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/api/portal/audit-export" className="block rounded-lg px-2 py-1.5 text-sm text-moss-700 hover:bg-sand-100">
                ↓ Audit log
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <Alert tone="warn">
          <p className="font-semibold">Automated daily backups</p>
          <p className="mt-1">
            Managed Postgres hosts (Neon, Supabase, Railway) take automatic daily snapshots — turn
            them on in your provider&apos;s dashboard. For an independent copy, schedule{' '}
            <code>npm run backup</code> nightly; it writes a timestamped JSON dump to{' '}
            <code>/backups</code>. The README documents both, plus the restore drill.
          </p>
        </Alert>
      </div>
    </div>
  );
}
