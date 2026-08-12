import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPeso } from '@/lib/money';

/** Small shared pieces. Deliberately plain — no component kit, no runtime. */

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export function Pill({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

const RESERVATION_TONE: Record<string, Tone> = {
  INQUIRY: 'muted',
  PENDING: 'warn',
  CONFIRMED: 'info',
  CHECKED_IN: 'ok',
  CHECKED_OUT: 'muted',
  COMPLETED: 'ok',
  CANCELLED: 'bad',
  NO_SHOW: 'bad',
};

const PAYMENT_TONE: Record<string, Tone> = {
  UNPAID: 'bad',
  PARTIALLY_PAID: 'warn',
  PAID: 'ok',
  PARTIALLY_REFUNDED: 'warn',
  REFUNDED: 'muted',
  FAILED: 'bad',
};

const READY_TONE: Record<string, Tone> = {
  READY: 'ok',
  CLEANING: 'warn',
  INSPECTION: 'info',
  BLOCKED: 'bad',
};

const PRIORITY_TONE: Record<string, Tone> = {
  LOW: 'muted',
  MEDIUM: 'info',
  HIGH: 'warn',
  URGENT: 'bad',
};

function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={RESERVATION_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}

export function PaymentPill({ status }: { status: string }) {
  return <Pill tone={PAYMENT_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}

export function ReadyPill({ state }: { state: string }) {
  return <Pill tone={READY_TONE[state] ?? 'muted'}>{humanise(state)}</Pill>;
}

export function PriorityPill({ priority }: { priority: string }) {
  return <Pill tone={PRIORITY_TONE[priority] ?? 'muted'}>{humanise(priority)}</Pill>;
}

/**
 * A headline number with the arithmetic behind it. The formula is not
 * decoration: an owner who cannot see how a figure was reached goes back to
 * her spreadsheet, and then this system is a data-entry chore.
 */
export function Stat({
  label,
  value,
  hint,
  formula,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  formula?: string;
  tone?: Tone;
}) {
  return (
    <div className="card p-3" title={formula}>
      <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${tone === 'bad' ? 'text-[color:var(--bad)]' : ''}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-[color:var(--color-ink-500)]">{hint}</div>}
      {formula && (
        <div className="mt-1 text-[11px] italic text-[color:var(--color-ink-500)]">{formula}</div>
      )}
    </div>
  );
}

export function Money({ cents, short = false }: { cents: number; short?: boolean }) {
  return <span className="tabular-nums">{short ? formatPeso(cents).replace(/\.00$/, '') : formatPeso(cents)}</span>;
}

/** Progress against a target, in CSS. No chart library for one bar. */
export function Bar({ value, target, tone = 'ok' }: { value: number; target: number; tone?: Tone }) {
  const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const colour = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--ok)';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-sand-200)]"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: colour }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[color:var(--color-sand-300)] p-6 text-center text-sm text-[color:var(--color-ink-500)]">
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-[color:var(--color-ink-500)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-[color:var(--color-clay-600)] hover:underline">
      ← {children}
    </Link>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required,
  placeholder,
  hint,
  step,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span aria-hidden> *</span>}
      </span>
      <input
        className="field"
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
      />
      {hint && <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 4,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="field" name={name} defaultValue={defaultValue} rows={rows} />
      {hint && <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field" name={name} defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{hint}</span>}
    </label>
  );
}

/** Feedback from a server action, shown above the form that caused it. */
export function Notice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-4 rounded-lg border p-3 text-sm ${
        kind === 'error'
          ? 'border-[color:var(--bad)] bg-[#fbe9e7] text-[color:var(--bad)]'
          : 'border-[color:var(--ok)] bg-[#e6f2ea] text-[color:var(--ok)]'
      }`}
    >
      {children}
    </p>
  );
}
