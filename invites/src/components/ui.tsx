import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPeso } from '@/lib/money';

/** Small shared pieces. Deliberately plain — no component kit, no runtime. */

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
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

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export function Pill({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

const ORDER_TONE: Record<string, Tone> = { PENDING_PAYMENT: 'warn', PAID: 'info', ACTIVE: 'ok', CANCELLED: 'muted', REFUNDED: 'bad' };
const PAYMENT_TONE: Record<string, Tone> = { PENDING: 'warn', PAID: 'ok', FAILED: 'bad', REJECTED: 'bad', REFUNDED: 'muted' };
const INVITATION_TONE: Record<string, Tone> = { DRAFT: 'warn', PUBLISHED: 'ok', EXPIRED: 'muted', ARCHIVED: 'muted' };
const DFY_TONE: Record<string, Tone> = { NEW: 'warn', INTAKE_RECEIVED: 'info', ENCODING: 'info', PREVIEW_SENT: 'warn', REVISION: 'bad', APPROVED: 'ok', PUBLISHED: 'ok' };

export function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function OrderPill({ status }: { status: string }) {
  return <Pill tone={ORDER_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}
export function PaymentPill({ status }: { status: string }) {
  return <Pill tone={PAYMENT_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}
export function InvitationPill({ status }: { status: string }) {
  return <Pill tone={INVITATION_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}
export function DfyPill({ status }: { status: string }) {
  return <Pill tone={DFY_TONE[status] ?? 'muted'}>{humanise(status)}</Pill>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === 'bad' ? 'text-[color:var(--bad)]' : tone === 'warn' ? 'text-[color:var(--warn)]' : ''}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[color:var(--color-ink-500)]">{hint}</div>}
    </div>
  );
}

export function Money({ cents, short = false }: { cents: number; short?: boolean }) {
  return <span className="tabular-nums">{short ? formatPeso(cents).replace(/\.00$/, '') : formatPeso(cents)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[color:var(--color-sand-300)] p-6 text-center text-sm text-[color:var(--color-ink-500)]">{children}</p>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="display text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[color:var(--color-ink-500)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-[color:var(--color-plum-600)] hover:underline">
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
  min,
  max,
  step,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} min={min} max={max} step={step} autoComplete={autoComplete} className="field" />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, name, defaultValue, required, placeholder, hint, rows = 4 }: { label: string; name: string; defaultValue?: string; required?: boolean; placeholder?: string; hint?: string; rows?: number }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <textarea id={name} name={name} defaultValue={defaultValue} required={required} placeholder={placeholder} rows={rows} className="field" />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, name, defaultValue, options, hint }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[]; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className="field">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4" />
      <span>
        {label}
        {hint && <span className="block text-xs text-[color:var(--color-ink-500)]">{hint}</span>}
      </span>
    </label>
  );
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const bg = tone === 'ok' ? '#e3f3e8' : tone === 'warn' ? '#fdf0dd' : tone === 'bad' ? '#fbe9e7' : tone === 'info' ? '#e3edf7' : 'var(--color-sand-100)';
  return (
    <p role={tone === 'bad' ? 'alert' : undefined} className="rounded-xl p-3 text-sm" style={{ background: bg }}>
      {children}
    </p>
  );
}

/** The two buttons that go on every page: Messenger and Viber. */
export function ContactButtons({ messenger, viber, className = '', size = 'md' }: { messenger: string; viber: string; className?: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'btn btn-sm' : 'btn';
  if (!messenger && !viber) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {messenger && (
        <a href={messenger} target="_blank" rel="noopener" className={`${cls} btn-secondary`}>
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#0084ff]" /> Messenger
        </a>
      )}
      {viber && (
        <a href={viber} className={`${cls} btn-secondary`}>
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#7360f2]" /> Viber
        </a>
      )}
    </div>
  );
}
