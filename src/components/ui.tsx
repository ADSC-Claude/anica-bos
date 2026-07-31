import Link from 'next/link';
import { formatPeso } from '@/lib/money';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold text-cocoa-800 sm:text-2xl">{title}</h1>
        {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-cocoa-600'
      : tone === 'warn'
        ? 'text-sand-500'
        : tone === 'bad'
          ? 'text-clay-500'
          : 'text-cocoa-800';

  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-cocoa-400">{label}</p>
      <p className={`mt-1 text-xl font-semibold num sm:text-2xl ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-cocoa-400">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card-pad block transition hover:border-cocoa-300">
        {inner}
      </Link>
    );
  }
  return <div className="card-pad">{inner}</div>;
}

export function Money({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`num ${className}`}>{formatPeso(cents)}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-semibold text-cocoa-700">{title}</p>
      {hint && <p className="muted max-w-md">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  PENDING: 'bg-sand-200 text-sand-500',
  CONFIRMED: 'bg-cocoa-100 text-cocoa-600',
  CHECKED_IN: 'bg-cocoa-200 text-cocoa-700',
  IN_SERVICE: 'bg-cocoa-600 text-white',
  COMPLETED: 'bg-cocoa-500 text-white',
  CANCELLED: 'bg-sand-200 text-cocoa-500',
  NO_SHOW: 'bg-clay-500/15 text-clay-500',
  EXPIRED: 'bg-sand-200 text-cocoa-400',
  PAID: 'bg-cocoa-100 text-cocoa-600',
  VOIDED: 'bg-clay-500/15 text-clay-500',
  REFUNDED: 'bg-clay-400/15 text-clay-500',
  APPROVED: 'bg-cocoa-100 text-cocoa-600',
  REJECTED: 'bg-clay-500/15 text-clay-500',
  DRAFT: 'bg-sand-200 text-cocoa-500',
  FINALIZED: 'bg-cocoa-500 text-white',
  ACTIVE: 'bg-cocoa-100 text-cocoa-600',
  RECEIVED: 'bg-cocoa-500 text-white',
  OK: 'bg-cocoa-100 text-cocoa-600',
  WARN: 'bg-sand-300 text-cocoa-700',
  BAD: 'bg-clay-500/15 text-clay-500',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = BADGE_TONES[status] ?? 'bg-sand-200 text-cocoa-600';
  return <span className={`badge ${tone}`}>{label ?? status.replaceAll('_', ' ').toLowerCase()}</span>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-cocoa-400">{hint}</span>}
    </label>
  );
}

export function Tabs({
  tabs,
  current,
}: {
  tabs: { href: string; label: string; badge?: number }[];
  current: string;
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-sand-200 no-print">
      {tabs.map((t) => {
        const active = current === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? 'border-cocoa-600 text-cocoa-800'
                : 'border-transparent text-cocoa-400 hover:text-cocoa-600'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 rounded-full bg-clay-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  children: React.ReactNode;
}) {
  const cls = {
    info: 'border-cocoa-200 bg-cocoa-50 text-cocoa-700',
    warn: 'border-sand-300 bg-sand-100 text-cocoa-700',
    danger: 'border-clay-400/40 bg-clay-500/10 text-clay-500',
    success: 'border-cocoa-300 bg-cocoa-100 text-cocoa-700',
  }[tone];
  return <div className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
