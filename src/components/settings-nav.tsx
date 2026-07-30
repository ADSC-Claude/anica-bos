import Link from 'next/link';
import type { Role } from '@prisma/client';
import { can } from '@/lib/rbac';

const SECTIONS = [
  { href: '/portal/settings', label: 'Business profile', permission: 'settings.view', hint: 'Name, address, hours, receipt footer' },
  { href: '/portal/settings/services', label: 'Service catalog', permission: 'settings.edit', hint: 'Services, prices, durations, recipes' },
  { href: '/portal/settings/resources', label: 'Rooms & beds', permission: 'settings.edit', hint: 'Bookable resources' },
  { href: '/portal/settings/discounts', label: 'Discount buttons', permission: 'settings.edit', hint: 'POS presets & member birthday perk' },
  { href: '/portal/settings/intake', label: 'Client intake form', permission: 'settings.edit', hint: 'Questions on the booking form and CRM' },
  { href: '/portal/settings/operations', label: 'Operations', permission: 'settings.edit', hint: 'Loyalty, rotation, retention, petty cash' },
  { href: '/portal/settings/booking', label: 'Online booking', permission: 'settings.critical', hint: 'Deposit %, expiry, gateway, fallback' },
  { href: '/portal/settings/payroll', label: 'Payroll rules', permission: 'settings.edit', hint: 'Allowance, deductions, holidays' },
  { href: '/portal/settings/tax', label: 'Tax & BIR', permission: 'settings.critical', hint: 'Regime, receipt notation, series' },
  { href: '/portal/settings/comms', label: 'Email & SMS', permission: 'settings.edit', hint: 'Templates and greetings' },
  { href: '/portal/settings/kpi', label: 'KPI targets', permission: 'settings.edit', hint: 'Monthly goals for the scorecard' },
  { href: '/portal/settings/permits', label: 'Permits & certificates', permission: 'settings.view', hint: 'Compliance tracker with reminders' },
  { href: '/portal/settings/users', label: 'User accounts', permission: 'users.manage', hint: 'Logins, roles, approval PINs' },
  { href: '/portal/settings/branches', label: 'Branches', permission: 'branches.manage', hint: 'Open and manage branches' },
  { href: '/portal/settings/audit', label: 'Audit log', permission: 'audit.view', hint: 'Every change, append-only' },
  { href: '/portal/settings/backup', label: 'Backup & export', permission: 'settings.critical', hint: 'Full data export and restore' },
] as const;

export function SettingsNav({ role, current }: { role: Role; current: string }) {
  const visible = SECTIONS.filter((s) => can(role, s.permission));
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-sand-200 no-print">
      {visible.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            current === s.href
              ? 'border-moss-600 text-moss-800'
              : 'border-transparent text-moss-400 hover:text-moss-600'
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

export function SettingsIndexCards({ role }: { role: Role }) {
  const visible = SECTIONS.filter((s) => can(role, s.permission) && s.href !== '/portal/settings');
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((s) => (
        <Link key={s.href} href={s.href} className="card-pad transition hover:border-moss-300">
          <p className="font-medium text-moss-800">{s.label}</p>
          <p className="muted mt-0.5">{s.hint}</p>
        </Link>
      ))}
    </div>
  );
}
