'use client';

import { useEffect, useState } from 'react';
import { formatPeso, formatPesoShort } from '@/lib/money';

/**
 * Four steps, one screen each on a phone. The guest can go back without losing
 * anything, and the price is re-fetched from the server at every forward step
 * — the number in this component is a display of the server's answer, never an
 * input to it.
 */

type AddOn = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  per: string;
  propertyId: string | null;
  maxQuantity: number;
};

type Available = {
  id: string;
  slug: string;
  name: string;
  city: string;
  branch: string;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  shortDescription: string;
  photo: string | null;
  fromPriceCents: number;
  available: boolean;
  reason: string | null;
};

type QuoteLine = { kind: string; label: string; amountCents: number };
type Quote = {
  nights: number;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  lines: QuoteLine[];
  promotion: { code: string; name: string } | null;
  promoError?: string;
};

export function BookingWizard({
  today,
  initial,
  addOns,
  depositPercent,
  cancellationPolicy,
  privacyNote,
  holdMinutes,
}: {
  today: string;
  initial: { checkIn: string; checkOut: string; adults: number; propertyId: string | null };
  addOns: AddOn[];
  depositPercent: number;
  cancellationPolicy: string;
  privacyNote: string;
  holdMinutes: number;
}) {
  const [step, setStep] = useState(initial.propertyId ? 2 : 1);
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [adults, setAdults] = useState(initial.adults);
  const [children, setChildren] = useState(0);
  const [propertyId, setPropertyId] = useState<string | null>(initial.propertyId);

  const [results, setResults] = useState<Available[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const property = results?.find((r) => r.id === propertyId) ?? null;

  async function search() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(
        `/api/public/availability?checkIn=${checkIn}&checkOut=${checkOut}&guests=${adults + children}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not check availability.');
      setResults(json.results);
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reprice(id = propertyId) {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: id,
          checkIn,
          checkOut,
          adults,
          children,
          addOns: Object.entries(selectedAddOns)
            .filter(([, q]) => q > 0)
            .map(([addOnId, quantity]) => ({ addOnId, quantity })),
          promoCode: promoCode || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not price that stay.');
      setQuote(json);
    } catch (e) {
      setError((e as Error).message);
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!results && step === 1) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step >= 2 && propertyId) void reprice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, propertyId, selectedAddOns]);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          checkIn,
          checkOut,
          adults,
          children,
          addOns: Object.entries(selectedAddOns)
            .filter(([, q]) => q > 0)
            .map(([addOnId, quantity]) => ({ addOnId, quantity })),
          promoCode: promoCode || undefined,
          specialRequests: String(data.get('specialRequests') ?? ''),
          guest: {
            firstName: String(data.get('firstName') ?? ''),
            lastName: String(data.get('lastName') ?? ''),
            email: String(data.get('email') ?? ''),
            mobile: String(data.get('mobile') ?? ''),
            country: String(data.get('country') ?? 'PH'),
            marketingConsent: data.get('marketingConsent') === 'on',
          },
          acceptedRules: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not complete that booking.');

      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
      } else {
        window.location.href = `/book/confirmation/${json.reference}`;
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      // A 409 means someone else took the dates while this guest was typing.
      // Re-search so they see the truth rather than a dead button.
      if (String((e as Error).message).includes('just been taken')) void search();
    }
  }

  const relevantAddOns = addOns.filter((a) => !a.propertyId || a.propertyId === propertyId);

  return (
    <div>
      <ol className="mb-6 flex gap-2 text-xs">
        {['Dates', 'Your stay', 'Your details', 'Payment'].map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-full px-3 py-1 text-center ${
              step === i + 1
                ? 'bg-[color:var(--color-clay-600)] text-white'
                : step > i + 1
                  ? 'bg-[color:var(--color-sand-200)]'
                  : 'bg-[color:var(--color-sand-100)] text-[color:var(--color-ink-500)]'
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-[#fbe9e7] p-3 text-sm text-[color:var(--bad)]">
          {error}
        </p>
      )}

      {/* --- step 1 ------------------------------------------------------ */}
      {step === 1 && (
        <section className="space-y-4">
          <div className="card grid gap-3 p-4 sm:grid-cols-4">
            <label className="block">
              <span className="label">Check in</span>
              <input className="field" type="date" value={checkIn} min={today} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Check out</span>
              <input className="field" type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">Adults</span>
              <input className="field" type="number" min={1} max={20} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="label">Children</span>
              <input className="field" type="number" min={0} max={20} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
            </label>
            <div className="sm:col-span-4">
              <button className="btn btn-primary w-full" type="button" onClick={search} disabled={busy}>
                {busy ? 'Checking…' : 'Check availability'}
              </button>
            </div>
          </div>

          {results?.map((r) => (
            <div
              key={r.id}
              className={`card flex gap-4 p-4 ${r.available ? '' : 'opacity-60'}`}
            >
              <div
                className="h-24 w-24 shrink-0 rounded-lg bg-[color:var(--color-sand-200)] bg-cover bg-center"
                style={r.photo ? { backgroundImage: `url('${r.photo}')` } : undefined}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{r.name}</h3>
                <p className="text-xs text-[color:var(--color-ink-500)]">
                  {r.city} · sleeps {r.maxGuests} · {r.bedrooms} bed{r.bedrooms === 1 ? '' : 's'} · {r.bathrooms} bath
                </p>
                <p className="mt-1 text-sm">{r.shortDescription}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold">{formatPesoShort(r.fromPriceCents)}</p>
                <p className="text-xs text-[color:var(--color-ink-500)]">per night</p>
                {r.available ? (
                  <button
                    className="btn btn-primary mt-2 px-3 py-1 text-sm"
                    type="button"
                    onClick={() => {
                      setPropertyId(r.id);
                      setStep(2);
                    }}
                  >
                    Choose
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-[color:var(--bad)]">{r.reason}</p>
                )}
              </div>
            </div>
          ))}

          {results && results.every((r) => !r.available) && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm">
              Nothing free on those dates. Try shifting by a day or two — or email us and we will see
              what we can do.
            </p>
          )}
        </section>
      )}

      {/* --- step 2 ------------------------------------------------------ */}
      {step === 2 && property && (
        <section className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold">{property.name}</h2>
            <p className="text-sm text-[color:var(--color-ink-500)]">
              {checkIn} → {checkOut} · {quote?.nights ?? '…'} nights · {adults + children} guests
            </p>
          </div>

          {relevantAddOns.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-2 font-semibold">Add to your stay</h3>
              <ul className="space-y-2">
                {relevantAddOns.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={(selectedAddOns[a.id] ?? 0) > 0}
                        onChange={(e) =>
                          setSelectedAddOns((prev) => ({ ...prev, [a.id]: e.target.checked ? 1 : 0 }))
                        }
                      />
                      <span>
                        <span className="font-medium">{a.name}</span>
                        {a.description && (
                          <span className="block text-xs text-[color:var(--color-ink-500)]">{a.description}</span>
                        )}
                      </span>
                    </label>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatPesoShort(a.priceCents)}
                      <span className="text-xs font-normal text-[color:var(--color-ink-500)]">
                        {a.per === 'NIGHT' ? '/night' : a.per === 'GUEST' ? '/guest' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <label className="label">Promo code</label>
            <div className="flex gap-2">
              <input
                className="field"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Optional"
              />
              <button className="btn btn-secondary" type="button" onClick={() => reprice()} disabled={busy}>
                Apply
              </button>
            </div>
            {quote?.promoError && <p className="mt-1 text-xs text-[color:var(--bad)]">{quote.promoError}</p>}
            {quote?.promotion && (
              <p className="mt-1 text-xs text-[color:var(--ok)]">{quote.promotion.name} applied.</p>
            )}
          </div>

          <Breakdown quote={quote} depositPercent={depositPercent} />

          <div className="flex gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn btn-primary flex-1"
              type="button"
              onClick={() => setStep(3)}
              disabled={!quote || busy}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {/* --- step 3 + 4 --------------------------------------------------- */}
      {step >= 3 && property && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <div className="card grid gap-3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">First name *</span>
              <input className="field" name="firstName" required autoComplete="given-name" />
            </label>
            <label className="block">
              <span className="label">Last name</span>
              <input className="field" name="lastName" autoComplete="family-name" />
            </label>
            <label className="block">
              <span className="label">Email *</span>
              <input className="field" name="email" type="email" required autoComplete="email" />
            </label>
            <label className="block">
              <span className="label">Mobile *</span>
              <input className="field" name="mobile" type="tel" required placeholder="+63 917 000 0000" autoComplete="tel" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Anything we should know?</span>
              <textarea className="field" name="specialRequests" rows={2} placeholder="Late arrival, allergies, celebrating something…" />
            </label>
            <input type="hidden" name="country" value="PH" />
          </div>

          <div className="card space-y-3 p-4 text-sm">
            <p className="text-[color:var(--color-ink-500)]">{privacyNote}</p>
            <label className="flex items-start gap-2">
              <input type="checkbox" required className="mt-1" />
              <span>
                I accept the house rules and the cancellation policy.
                <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">{cancellationPolicy}</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="marketingConsent" className="mt-1" />
              <span>
                Send me occasional offers.
                <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">Optional, one click to stop.</span>
              </span>
            </label>
          </div>

          <Breakdown quote={quote} depositPercent={depositPercent} />

          <p className="text-center text-xs text-[color:var(--color-ink-500)]">
            Your dates are held for {holdMinutes} minutes once you continue. Payment is handled by
            PayMongo — GCash, Maya, card or online banking. We never see your card.
          </p>

          <div className="flex gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary flex-1" type="submit" disabled={busy || !quote}>
              {busy ? 'One moment…' : quote ? `Pay ${formatPeso(quote.depositCents)}` : 'Pay'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Breakdown({ quote, depositPercent }: { quote: Quote | null; depositPercent: number }) {
  if (!quote) return <div className="card p-4 text-sm text-[color:var(--color-ink-500)]">Pricing…</div>;
  return (
    <div className="card p-4">
      <table className="w-full text-sm">
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1">{l.label}</td>
              <td className={`py-1 text-right tabular-nums ${l.amountCents < 0 ? 'text-[color:var(--ok)]' : ''}`}>
                {formatPeso(l.amountCents)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-[color:var(--color-sand-300)] font-bold">
            <td className="py-1.5">Total</td>
            <td className="py-1.5 text-right tabular-nums">{formatPeso(quote.totalCents)}</td>
          </tr>
          {quote.balanceCents > 0 && (
            <>
              <tr>
                <td className="py-1">Pay now ({depositPercent}%)</td>
                <td className="py-1 text-right tabular-nums">{formatPeso(quote.depositCents)}</td>
              </tr>
              <tr className="text-[color:var(--color-ink-500)]">
                <td className="py-1">Balance, before you arrive</td>
                <td className="py-1 text-right tabular-nums">{formatPeso(quote.balanceCents)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
        This is the whole price. Nothing else is added at the payment step.
      </p>
    </div>
  );
}
