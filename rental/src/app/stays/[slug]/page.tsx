import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { fromPrice } from '@/lib/pricing';
import { formatPeso, formatPesoShort } from '@/lib/money';
import { calendarGrid } from '@/lib/calendar';
import {
  addDays,
  addMonthsToKey,
  dateKeyRange,
  formatMonthKey,
  manilaDateKey,
  manilaMonthKey,
  minutesToLabel,
  monthBounds,
} from '@/lib/datetime';
import { appUrl } from '@/lib/app-url';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await prisma.property.findUnique({
    where: { slug },
    include: { photos: { orderBy: [{ isCover: 'desc' }], take: 1 } },
  });
  if (!p) return { title: 'Not found' };
  return {
    title: p.name,
    description: p.shortDescription,
    openGraph: {
      title: p.name,
      description: p.shortDescription,
      images: p.photos[0]?.url ? [`${appUrl()}${p.photos[0].url}`] : undefined,
    },
  };
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { slug } = await params;
  const { month } = await searchParams;
  const settings = await getSettings();

  const p = await prisma.property.findUnique({
    where: { slug },
    include: {
      photos: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }] },
      amenities: { include: { amenity: true } },
      faqs: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      branch: true,
      reviews: { where: { published: true }, orderBy: { createdAt: 'desc' }, take: 6 },
      addOns: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!p || p.status !== 'ACTIVE') notFound();

  const monthKey = month ?? manilaMonthKey();
  const { fromKey, toKey } = monthBounds(monthKey);
  const grid = await calendarGrid([p.id], fromKey, toKey);
  const days = grid.get(p.id) ?? [];
  const from = await fromPrice(p.id);
  const today = manilaDateKey();

  const rating =
    p.reviews.length > 0 ? p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length : null;

  const byCategory = new Map<string, string[]>();
  for (const a of p.amenities) {
    byCategory.set(a.amenity.category, [...(byCategory.get(a.amenity.category) ?? []), a.amenity.name]);
  }

  return (
    <>
      <SiteHeader settings={settings} active="stays" />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <Link href="/stays" className="text-sm text-[color:var(--color-clay-600)] hover:underline">
          ← All stays
        </Link>

        <header className="mt-2 mb-5">
          <h1 className="display text-3xl font-bold">{p.name}</h1>
          <p className="text-sm text-[color:var(--color-ink-500)]">
            {p.type.toLowerCase()} · sleeps {p.maxGuests} · {p.bedrooms} bedroom
            {p.bedrooms === 1 ? '' : 's'} · {p.beds} bed{p.beds === 1 ? '' : 's'} · {p.bathrooms} bath
            {p.floorAreaSqm ? ` · ${p.floorAreaSqm} sqm` : ''}
            {rating && ` · ★ ${rating.toFixed(1)} (${p.reviews.length})`}
          </p>
        </header>

        {p.photos.length > 0 && (
          <div className="mb-8 grid gap-2 sm:grid-cols-4">
            <div
              className="h-64 rounded-xl bg-[color:var(--color-sand-200)] bg-cover bg-center sm:col-span-2 sm:row-span-2 sm:h-full"
              style={{ backgroundImage: `url('${p.photos[0].url}')` }}
              role="img"
              aria-label={p.photos[0].caption || p.name}
            />
            {p.photos.slice(1, 5).map((photo) => (
              <div
                key={photo.id}
                className="h-32 rounded-xl bg-[color:var(--color-sand-200)] bg-cover bg-center"
                style={{ backgroundImage: `url('${photo.url}')` }}
                role="img"
                aria-label={photo.caption || p.name}
              />
            ))}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section>
              <h2 className="display mb-2 text-xl font-bold">About this place</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">{p.description}</p>
            </section>

            {byCategory.size > 0 && (
              <section>
                <h2 className="display mb-2 text-xl font-bold">What is here</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[...byCategory].map(([category, names]) => (
                    <div key={category}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">
                        {category}
                      </h3>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {names.map((n) => (
                          <li key={n}>· {n}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="display mb-2 text-xl font-bold">Availability</h2>
              <div className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Link
                    className="btn btn-secondary px-3 py-1 text-sm"
                    href={`/stays/${p.slug}?month=${addMonthsToKey(monthKey, -1)}`}
                  >
                    ←
                  </Link>
                  <span className="font-semibold">{formatMonthKey(monthKey)}</span>
                  <Link
                    className="btn btn-secondary px-3 py-1 text-sm"
                    href={`/stays/${p.slug}?month=${addMonthsToKey(monthKey, 1)}`}
                  >
                    →
                  </Link>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <span key={i} className="text-[color:var(--color-ink-500)]">
                      {d}
                    </span>
                  ))}
                  {(() => {
                    const first = new Date(`${fromKey}T00:00:00Z`).getUTCDay();
                    return Array.from({ length: first }, (_, i) => <span key={`pad${i}`} />);
                  })()}
                  {days.map((d) => (
                    <span
                      key={d.key}
                      className={`rounded py-1.5 ${
                        d.state === 'AVAILABLE' && d.key >= today
                          ? 'bg-[color:var(--color-sand-100)]'
                          : 'bg-[color:var(--color-sand-300)] text-[color:var(--color-ink-500)] line-through'
                      }`}
                      title={d.state === 'AVAILABLE' ? 'Free' : 'Taken'}
                    >
                      {Number(d.key.slice(-2))}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
                  Live from our calendar, including Airbnb — never a stale copy.
                </p>
              </div>
            </section>

            <section className="grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="display mb-2 text-xl font-bold">House rules</h2>
                <p className="whitespace-pre-line text-sm">{p.houseRules}</p>
                <p className="mt-2 text-sm text-[color:var(--color-ink-500)]">
                  Check in from {minutesToLabel(p.checkInMinute)} · check out by{' '}
                  {minutesToLabel(p.checkOutMinute)}
                </p>
              </div>
              <div>
                <h2 className="display mb-2 text-xl font-bold">Getting there</h2>
                <p className="whitespace-pre-line text-sm">{p.transportNotes}</p>
                {p.parkingNotes && <p className="mt-2 whitespace-pre-line text-sm">{p.parkingNotes}</p>}
              </div>
              {p.nearbyAttractions && (
                <div>
                  <h2 className="display mb-2 text-xl font-bold">Nearby</h2>
                  <p className="whitespace-pre-line text-sm">{p.nearbyAttractions}</p>
                </div>
              )}
              <div>
                <h2 className="display mb-2 text-xl font-bold">Cancellation</h2>
                <p className="text-sm">{p.cancellationPolicy || settings['booking.cancellationPolicy']}</p>
              </div>
            </section>

            {p.reviews.length > 0 && (
              <section>
                <h2 className="display mb-3 text-xl font-bold">Reviews</h2>
                <div className="space-y-3">
                  {p.reviews.map((r) => (
                    <blockquote key={r.id} className="card p-4 text-sm">
                      <p className="font-semibold">
                        {'★'.repeat(r.rating)}
                        <span className="ml-2 font-normal text-[color:var(--color-ink-500)]">
                          {r.guestName || 'Guest'} · {r.platform.toLowerCase()}
                        </span>
                      </p>
                      <p className="mt-1 italic">“{r.body}”</p>
                      {r.response && (
                        <p className="mt-2 border-l-2 border-[color:var(--color-sand-300)] pl-3 text-xs">
                          <strong>Our reply:</strong> {r.response}
                        </p>
                      )}
                    </blockquote>
                  ))}
                </div>
              </section>
            )}

            {p.faqs.length > 0 && (
              <section>
                <h2 className="display mb-3 text-xl font-bold">Questions about this place</h2>
                <div className="space-y-2">
                  {p.faqs.map((f) => (
                    <details key={f.id} className="card p-4">
                      <summary className="cursor-pointer font-medium">{f.question}</summary>
                      <p className="mt-2 text-sm text-[color:var(--color-ink-500)]">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* --- the price card ------------------------------------------ */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <form action="/book" className="card space-y-3 p-5">
              <input type="hidden" name="property" value={p.id} />
              <p className="text-2xl font-bold">
                {formatPesoShort(from)}
                <span className="text-sm font-normal text-[color:var(--color-ink-500)]"> / night</span>
              </p>

              <label className="block">
                <span className="label">Check in</span>
                <input className="field" type="date" name="checkIn" min={today} defaultValue={addDays(today, 7)} required />
              </label>
              <label className="block">
                <span className="label">Check out</span>
                <input className="field" type="date" name="checkOut" min={today} defaultValue={addDays(today, 10)} required />
              </label>
              <label className="block">
                <span className="label">Guests</span>
                <select className="field" name="adults" defaultValue="2">
                  {Array.from({ length: p.maxGuests }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} guest{n === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </label>

              <dl className="space-y-1 border-t border-[color:var(--color-sand-200)] pt-3 text-sm">
                {p.cleaningFeeCents > 0 && (
                  <div className="flex justify-between">
                    <dt>Cleaning fee</dt>
                    <dd>{formatPeso(p.cleaningFeeCents)}</dd>
                  </div>
                )}
                {p.securityDepositCents > 0 && (
                  <div className="flex justify-between text-[color:var(--color-ink-500)]">
                    <dt>Refundable deposit</dt>
                    <dd>{formatPeso(p.securityDepositCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-[color:var(--color-ink-500)]">
                  <dt>Minimum stay</dt>
                  <dd>
                    {p.minNights} night{p.minNights === 1 ? '' : 's'}
                  </dd>
                </div>
              </dl>

              <button className="btn btn-primary w-full" type="submit">
                Book now
              </button>
              <p className="text-center text-xs text-[color:var(--color-ink-500)]">
                Best rate, booked direct. You see the full total before you pay.
              </p>
            </form>

            {p.addOns.length > 0 && (
              <div className="card mt-3 p-4 text-sm">
                <h3 className="mb-1 font-semibold">Optional extras</h3>
                <ul className="space-y-1 text-[color:var(--color-ink-500)]">
                  {p.addOns.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{a.name}</span>
                      <span>{formatPesoShort(a.priceCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
