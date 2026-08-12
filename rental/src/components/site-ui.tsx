import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPesoShort } from '@/lib/money';

/**
 * The pieces the public pages are assembled from.
 *
 * Everything here renders on the server. The one interactive element — the
 * availability form — is a plain `<form method="GET">` that posts to /book, so
 * a guest can search before any JavaScript has arrived.
 */

/* ── icons ──────────────────────────────────────────────────────────────
   One set, one stroke weight, one 24-unit grid. Drawn rather than pulled from
   a library so the five that appear side by side on the landing page share an
   optical weight; mismatched icon sets are the fastest way to make a careful
   page look assembled from parts.
   ---------------------------------------------------------------------- */

type IconProps = { size?: number; className?: string };

function svg(children: ReactNode, { size = 28, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  direct: (p: IconProps = {}) =>
    svg(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7 12h10M13 8l4 4-4 4" />
      </>,
      p,
    ),
  pin: (p: IconProps = {}) =>
    svg(
      <>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>,
      p,
    ),
  key: (p: IconProps = {}) =>
    svg(
      <>
        <circle cx="8" cy="12" r="4" />
        <path d="M12 12h9M18.5 12v3.2M15.5 12v2.4" />
      </>,
      p,
    ),
  checklist: (p: IconProps = {}) =>
    svg(
      <>
        <rect x="5" y="5" width="14" height="16" rx="2" />
        <path d="M9.5 3h5v3.2h-5z" />
        <path d="M8.8 13.4l2.4 2.4 4.2-4.6" />
      </>,
      p,
    ),
  person: (p: IconProps = {}) =>
    svg(
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
      </>,
      p,
    ),
  calendar: (p: IconProps = {}) =>
    svg(
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </>,
      p,
    ),
  bed: (p: IconProps = {}) =>
    svg(
      <>
        <path d="M3 18v-6.5h18V18M3 18v2M21 18v2M3 12V6" />
        <path d="M7 11.5V9.5h4v2M13 11.5V9.5h4v2" />
      </>,
      p,
    ),
  camera: (p: IconProps = {}) =>
    svg(
      <>
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M9 7l1.5-2.5h3L15 7" />
        <circle cx="12" cy="13.5" r="3.5" />
      </>,
      p,
    ),
};

/* ── layout pieces ──────────────────────────────────────────────────── */

/** Eyebrow over a centred serif headline. The eyebrow says which section this
 *  is; the headline says what it's for. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  align = 'center',
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: 'center' | 'left';
}) {
  const a = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} mb-10`}>
      {eyebrow && <p className={`eyebrow mb-3 ${a}`}>{eyebrow}</p>}
      <h2 className="display text-balance text-[1.75rem] leading-tight sm:text-[2.125rem]">{title}</h2>
      {intro && <p className="mt-4 text-[color:var(--color-ink-500)]">{intro}</p>}
    </div>
  );
}

/** The header block on every page that isn't the landing page. */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-100)]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="display max-w-3xl text-balance text-[2.25rem] leading-[1.08] sm:text-[3.25rem]">
          {title}
        </h1>
        {intro && <p className="mt-5 max-w-2xl text-[color:var(--color-ink-700)]">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

/* ── availability search ────────────────────────────────────────────── */

/**
 * A plain GET form to /book. `floating` lifts it over the hero photograph the
 * way the landing page wants it; without it, it sits inline.
 *
 * The fields are real date inputs rather than a custom picker: the native one
 * is the control a guest already knows, it works with a keyboard and a screen
 * reader, and on a phone it opens the OS date wheel.
 */
export function SearchBar({
  today,
  defaultCheckIn,
  defaultCheckOut,
  floating = false,
}: {
  today: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  floating?: boolean;
}) {
  return (
    <form
      action="/book"
      className={
        floating
          ? 'relative z-10 mx-auto -mt-16 grid w-[calc(100%-2.5rem)] max-w-5xl grid-cols-1 items-center bg-[color:var(--card-bg)] p-3 shadow-[0_14px_44px_rgba(38,30,20,0.13)] md:-mt-12 md:grid-cols-[1fr_1fr_1fr_auto] md:pl-0'
          : 'card grid grid-cols-1 items-center p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:pl-0'
      }
    >
      <label className="sfield flex items-center gap-3 px-4 py-2.5">
        <span className="text-[color:var(--color-ink-500)]">{Icon.calendar({ size: 20 })}</span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Check-in</span>
          <input
            type="date"
            name="checkIn"
            required
            defaultValue={defaultCheckIn}
            min={today}
            aria-label="Check-in date"
            className="w-full border-0 bg-transparent p-0 text-[0.9375rem] focus:outline-none"
            style={{ minHeight: 'unset' }}
          />
        </span>
      </label>

      <label className="sfield flex items-center gap-3 px-4 py-2.5">
        <span className="text-[color:var(--color-ink-500)]">{Icon.calendar({ size: 20 })}</span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Check-out</span>
          <input
            type="date"
            name="checkOut"
            required
            defaultValue={defaultCheckOut}
            min={today}
            aria-label="Check-out date"
            className="w-full border-0 bg-transparent p-0 text-[0.9375rem] focus:outline-none"
            style={{ minHeight: 'unset' }}
          />
        </span>
      </label>

      <label className="sfield flex items-center gap-3 px-4 py-2.5">
        <span className="text-[color:var(--color-ink-500)]">{Icon.person({ size: 20 })}</span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Guests</span>
          <select
            name="adults"
            defaultValue="2"
            aria-label="Number of guests"
            className="w-full border-0 bg-transparent p-0 text-[0.9375rem] focus:outline-none"
            style={{ minHeight: 'unset' }}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} guest{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </span>
      </label>

      <button type="submit" className="btn-brand tracked mt-2 w-full md:mt-0 md:w-auto">
        Check availability
      </button>
    </form>
  );
}

/* ── cards ──────────────────────────────────────────────────────────── */

export function FeatureRow({
  items,
}: {
  items: { icon: ReactNode; title: string; body: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-y-9 md:grid-cols-3 lg:grid-cols-5">
      {items.map((f) => (
        <div key={f.title} className="feature relative px-4 text-center">
          <span className="mb-3.5 inline-block text-[color:var(--color-clay-600)]">{f.icon}</span>
          <p className="mb-1.5 font-medium">{f.title}</p>
          <p className="text-[0.8125rem] leading-relaxed text-[color:var(--color-ink-500)]">{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export type StayCardData = {
  slug: string;
  name: string;
  shortDescription: string;
  city: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  fromCents: number;
  photoUrl?: string;
};

export function StayCard({ p }: { p: StayCardData }) {
  return (
    <Link href={`/stays/${p.slug}`} className="card group overflow-hidden transition-shadow hover:shadow-lg">
      <div
        className="h-44 bg-[color:var(--color-sand-200)] bg-cover bg-center"
        style={p.photoUrl ? { backgroundImage: `url('${p.photoUrl}')` } : undefined}
      />
      <div className="p-5">
        <h3 className="display text-xl">{p.name}</h3>
        <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">
          {p.city} · sleeps {p.maxGuests} · {p.bedrooms === 0 ? 'studio' : `${p.bedrooms} bedroom${p.bedrooms === 1 ? '' : 's'}`} ·{' '}
          {p.bathrooms} bath
        </p>
        {p.shortDescription && (
          <p className="mt-3 text-sm text-[color:var(--color-ink-500)]">{p.shortDescription}</p>
        )}
        <p className="mt-4 flex items-baseline gap-1.5 border-t border-[color:var(--color-sand-200)] pt-3.5 text-[0.8125rem] text-[color:var(--color-ink-500)] tabular-nums">
          from{' '}
          <span className="text-xl font-semibold text-[color:var(--color-clay-600)]">
            {formatPesoShort(p.fromCents)}
          </span>{' '}
          / night
        </p>
      </div>
    </Link>
  );
}
