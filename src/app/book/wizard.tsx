'use client';

import { useEffect, useMemo, useState } from 'react';
import { FloorPlan, type PlanPlace } from '@/components/floor-plan';
import { useRouter } from 'next/navigation';
import { formatPeso } from '@/lib/money';

type Catalog = {
  branches: { id: string; name: string; address: string }[];
  categories: {
    id: string;
    name: string;
    services: { id: string; name: string; durationMinutes: number; priceCents: number }[];
  }[];
  fields: {
    key: string;
    label: string;
    section: 'PROFILE' | 'MEDICAL';
    type: string;
    options: string[];
    helpText: string;
    required: boolean;
  }[];
  depositPercent: number;
  expiryMinutes: number;
  manualFallback: boolean;
  gcash: { name: string; number: string; bank: string };
  bookingEnabled: boolean;
  /** The largest party the floor could hold — 8 beds and 2 chairs is 10. */
  maxParty?: number;
};

type Slot = {
  minute: number; label: string; startAt: string; therapists: number;
  /** Runs past closing: can be requested, but the spa has to agree to stay. */
  needsApproval: boolean;
};

const CITIES = [
  'Quezon City', 'Caloocan City', 'Las Piñas City', 'Makati City', 'Malabon City',
  'Mandaluyong City', 'Manila', 'Marikina City', 'Muntinlupa City', 'Navotas City',
  'Parañaque City', 'Pasay City', 'Pasig City', 'Pateros', 'San Juan City',
  'Taguig City', 'Valenzuela City', 'Antipolo City', 'Cainta', 'Other',
];

function todayKey(): string {
  const now = new Date(Date.now() + 8 * 3600_000);
  return now.toISOString().slice(0, 10);
}

export function BookingWizard() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [branchId, setBranchId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  /**
   * Everyone else in the party. Names only — the person booking is the client
   * of record, and asking four people for a birthday and a medical history at
   * the point of booking loses the booking.
   */
  const [guests, setGuests] = useState<{ name: string; serviceIds: string[] }[]>([]);
  const [seats, setSeats] = useState<Record<number, string>>({});
  const [activeGuest, setActiveGuest] = useState(0);
  const [dateKey, setDateKey] = useState(todayKey());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [startAt, setStartAt] = useState('');
  const [therapists, setTherapists] = useState<{ id: string; name: string }[]>([]);
  const [resources, setResources] = useState<{ id: string; name: string; type: string }[]>([]);
  const [plan, setPlan] = useState<PlanPlace[]>([]);
  const [accepts, setAccepts] = useState<string[] | null>(null);
  const [guestAccepts, setGuestAccepts] = useState<(string[] | null)[]>([]);
  const [therapistId, setTherapistId] = useState('any');
  const [resourceId, setResourceId] = useState('any');
  const [slotInfo, setSlotInfo] = useState<{ priceCents: number; depositCents: number } | null>(null);

  const [client, setClient] = useState({
    name: '', mobile: '', email: '', birthday: '',
    addressCity: 'Quezon City', addressLine: '', barangay: '',
  });
  const [intake, setIntake] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    fetch('/api/public/catalog')
      .then((r) => r.json())
      .then((data: Catalog) => {
        setCatalog(data);
        setBranchId(data.branches[0]?.id ?? '');
      })
      .catch(() => setError('We could not load the booking form. Please refresh.'));
  }, []);

  const allServices = useMemo(
    () => catalog?.categories.flatMap((c) => c.services) ?? [],
    [catalog],
  );
  /** `svcA,svcB|svcC` — one group per guest, in the order they are shown. */
  const guestParam = useMemo(
    () => guests.map((g) => g.serviceIds.join(',')).join('|'),
    [guests],
  );
  const partyReady =
    serviceIds.length > 0 &&
    guests.every((g) => g.name.trim() !== '' && g.serviceIds.length > 0);

  /**
   * A whole-unit place the party has half filled.
   *
   * Picking one bed of a couples room and letting the spa assign the other
   * guest elsewhere leaves a bed nobody can book. The engine refuses it, but
   * being refused after the payment step is a bad way to find out.
   */
  const stranded = useMemo(() => {
    if (resourceId === 'any') return null;
    const chosenIds = Object.values(seats);
    for (const p of plan) {
      if (!p.exclusiveUse) continue;
      const ours = chosenIds.filter((id) => id === p.id).length;
      if (ours > 0 && ours + p.taken < p.capacity) return p;
    }
    return null;
  }, [seats, plan, resourceId]);
  const chosen = allServices.filter((s) => serviceIds.includes(s.id));
  const totalMinutes = chosen.reduce((a, s) => a + s.durationMinutes, 0);
  const totalPrice = chosen.reduce((a, s) => a + s.priceCents, 0);
  const deposit = slotInfo?.depositCents ?? Math.round((totalPrice * (catalog?.depositPercent ?? 30)) / 100);

  // Load the day's slots whenever the service or date changes.
  useEffect(() => {
    if (!partyReady || !dateKey || !branchId) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlots(null);
    setStartAt('');
    const params = new URLSearchParams({ branchId, date: dateKey, serviceIds: serviceIds.join(',') });
    if (guestParam) params.set('guests', guestParam);
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setSlots(data.slots ?? []);
      })
      .catch(() => !cancelled && setError('Could not check availability. Please try again.'));
    return () => { cancelled = true; };
  }, [serviceIds, dateKey, branchId, guestParam, partyReady]);

  // Load therapists/rooms for the picked slot.
  useEffect(() => {
    if (!startAt) return;
    const params = new URLSearchParams({
      branchId, date: dateKey, serviceIds: serviceIds.join(','), startAt,
    });
    if (guestParam) params.set('guests', guestParam);
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTherapists(data.therapists ?? []);
        setResources(data.resources ?? []);
        setPlan(data.plan ?? []);
        setAccepts(data.accepts ?? null);
        setGuestAccepts(data.guestAccepts ?? []);
        setSeats({});
        setActiveGuest(0);
        setSlotInfo({ priceCents: data.priceCents, depositCents: data.depositCents });
        setTherapistId('any');
        setResourceId('any');
      })
      .catch(() => setError('Could not load therapists for that time.'));
  }, [startAt, branchId, dateKey, serviceIds, guestParam]);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId, serviceIds, startAtIso: startAt,
          therapistId: therapistId === 'any' ? null : therapistId,
          resourceId: resourceId === 'any' ? null : (seats[0] ?? null),
          client, intake, notes, consent, promoCode: promoCode || undefined,
          guests: guests.map((g, i) => ({
            name: g.name.trim(),
            serviceIds: g.serviceIds,
            // seats[0] is the booker, so a guest's own place is seats[i + 1].
            resourceId: resourceId === 'any' ? null : (seats[i + 1] ?? null),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return; }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      router.push(`/book/confirmation/${data.reference}`);
    } catch {
      setError('We could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  if (!catalog) {
    return <p className="mt-8 text-center text-sm text-cocoa-500">Loading the booking form…</p>;
  }
  if (!catalog.bookingEnabled) {
    return (
      <div className="card-pad mt-6">
        <p className="font-semibold text-cocoa-800">Online booking is paused</p>
        <p className="muted mt-1">Please call us and we&apos;ll set your appointment by phone.</p>
      </div>
    );
  }

  const maxDate = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const medicalFields = catalog.fields.filter((f) => f.section === 'MEDICAL');
  const profileFields = catalog.fields.filter((f) => f.section === 'PROFILE');

  const canStep2 = serviceIds.length > 0 && Boolean(startAt);
  const canSubmit =
    canStep2 && client.name.length > 1 && client.mobile.length > 6 &&
    /\S+@\S+\.\S+/.test(client.email) && Boolean(client.birthday) &&
    Boolean(client.addressCity) && consent;

  return (
    <div className="mt-6 space-y-4">
      <ol className="flex gap-1 text-[11px] font-semibold uppercase tracking-wide">
        {['Service & time', 'Therapist & room', 'Your details'].map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-lg px-2 py-1.5 text-center ${
              step === i + 1 ? 'bg-cocoa-600 text-white' : 'bg-sand-200 text-cocoa-500'
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-xl bg-clay-500/10 px-3 py-2 text-sm text-clay-500">
          {error}
        </p>
      )}

      {/* ------------------------------------------------- step 1 */}
      {step === 1 && (
        <div className="card-pad space-y-4">
          {catalog.branches.length > 1 && (
            <label className="block">
              <span className="label">Branch</span>
              <select className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {catalog.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="label">How many of you?</span>
            <div className="mb-1 flex flex-wrap gap-1.5">
              {Array.from({ length: Math.max(4, catalog.maxParty ?? 4) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() =>
                    setGuests((prev) => {
                      const next = prev.slice(0, n - 1);
                      while (next.length < n - 1) next.push({ name: '', serviceIds: [] });
                      return next;
                    })
                  }
                  aria-pressed={guests.length === n - 1}
                  className={`min-h-11 min-w-11 rounded-xl border px-4 text-sm font-semibold transition ${
                    guests.length === n - 1
                      ? 'border-cocoa-600 bg-cocoa-600 text-white'
                      : 'border-sand-200 bg-white text-cocoa-700 hover:border-cocoa-300'
                  }`}
                >
                  {n === 1 ? 'Just me' : n}
                </button>
              ))}
            </div>
            <p className="mb-4 text-[11px] text-cocoa-400">
              Everyone books together and pays one reservation fee. Each of you can have a
              different treatment. Larger groups depend on the therapists on shift that
              evening — pick your size and the free times will show what we can take.
            </p>
          </div>

          <div>
            <span className="label">
              {guests.length ? 'Your treatment' : 'Choose your service'}
            </span>
            <div className="space-y-3">
              {catalog.categories.map((cat) => (
                <fieldset key={cat.id}>
                  <legend className="mb-1.5 text-xs font-semibold text-cocoa-500">{cat.name}</legend>
                  <div className="grid gap-1.5">
                    {cat.services.map((s) => {
                      const active = serviceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setServiceIds((prev) =>
                              prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                            )
                          }
                          className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                            active
                              ? 'border-cocoa-600 bg-cocoa-50'
                              : 'border-sand-200 bg-white hover:border-cocoa-300'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-cocoa-800">{s.name}</span>
                            <span className="block text-xs text-cocoa-400">{s.durationMinutes} min</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold num text-cocoa-700">
                            {formatPeso(s.priceCents)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>

          {/* One block per guest. Deliberately the same service buttons as the
              booker's, because "the same list, for Nina" is a thing anyone can
              follow without instructions. */}
          {guests.map((g, i) => (
            <div key={i} className="rounded-2xl border border-sand-200 bg-sand-50 p-3">
              <label className="block">
                <span className="label">Guest {i + 2} — name</span>
                <input
                  className="input"
                  value={g.name}
                  placeholder="Who is coming with you?"
                  onChange={(e) =>
                    setGuests((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <span className="mt-1 block text-[11px] text-cocoa-400">
                  A first name is enough — we take the rest when you arrive.
                </span>
              </label>
              <div className="mt-2">
                <span className="label">Their treatment</span>
                <div className="grid gap-1.5">
                  {allServices.map((sv) => {
                    const on = g.serviceIds.includes(sv.id);
                    return (
                      <button
                        key={sv.id}
                        type="button"
                        onClick={() =>
                          setGuests((prev) =>
                            prev.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    serviceIds: on
                                      ? x.serviceIds.filter((y) => y !== sv.id)
                                      : [...x.serviceIds, sv.id],
                                  }
                                : x,
                            ),
                          )
                        }
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-1.5 text-left text-sm transition ${
                          on ? 'border-cocoa-600 bg-cocoa-50' : 'border-sand-200 bg-white'
                        }`}
                      >
                        <span className="min-w-0 truncate text-cocoa-800">{sv.name}</span>
                        <span className="num shrink-0 text-cocoa-600">
                          {formatPeso(sv.priceCents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {serviceIds.length > 0 && !partyReady && (
            <p className="text-sm text-clay-500">
              Give every guest a name and a treatment to see the free times.
            </p>
          )}

          {partyReady && (
            <>
              <div className="rounded-xl bg-sand-100 px-3 py-2 text-sm text-cocoa-700">
                {guests.length ? (
                  <>
                    Party of {guests.length + 1} ·{' '}
                    <strong className="num">
                      {formatPeso(
                        totalPrice +
                          guests.reduce(
                            (a, g) =>
                              a +
                              g.serviceIds.reduce(
                                (b, id) =>
                                  b + (allServices.find((x) => x.id === id)?.priceCents ?? 0),
                                0,
                              ),
                            0,
                          ),
                      )}
                    </strong>{' '}
                    total
                  </>
                ) : (
                  <>
                    {chosen.length} service{chosen.length > 1 ? 's' : ''} · {totalMinutes} minutes ·{' '}
                    <strong className="num">{formatPeso(totalPrice)}</strong>
                  </>
                )}
              </div>

              <label className="block">
                <span className="label">Preferred date</span>
                <input
                  type="date"
                  className="input"
                  value={dateKey}
                  min={todayKey()}
                  max={maxDate}
                  onChange={(e) => setDateKey(e.target.value)}
                />
              </label>

              <div>
                <span className="label">Available start times (12nn – 12mn)</span>
                {slots === null ? (
                  <p className="text-sm text-cocoa-400">Checking availability…</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-clay-500">
                    No free slots left that day. Try another date.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {slots.map((s) => (
                      <button
                        key={s.startAt}
                        type="button"
                        onClick={() => setStartAt(s.startAt)}
                        className={`min-h-11 rounded-xl border px-2 py-1.5 text-sm font-medium transition ${
                          startAt === s.startAt
                            ? 'border-cocoa-600 bg-cocoa-600 text-white'
                            : s.needsApproval
                              ? 'border-dashed border-gilt-500 bg-white text-cocoa-700 hover:border-cocoa-300'
                              : 'border-sand-200 bg-white text-cocoa-700 hover:border-cocoa-300'
                        }`}
                      >
                        {s.label}
                        {/* A dashed edge and a word, not just a colour — the
                            difference between "booked" and "asked for" is worth
                            more than a hue nobody decodes. */}
                        {s.needsApproval && (
                          <span
                            className={`block text-[10px] font-normal leading-tight ${
                              startAt === s.startAt ? 'text-sand-200' : 'text-gilt-600'
                            }`}
                          >
                            on request
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {slots?.some((x) => x.needsApproval) && (
                  <p className="mt-2 text-[11px] leading-relaxed text-cocoa-500">
                    Times marked <strong className="text-gilt-600">on request</strong> run past
                    our closing hour. You can still ask for them — we will confirm whether a
                    therapist can stay, and <strong>nothing is charged until we do</strong>.
                  </p>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={!canStep2}
            onClick={() => { setError(''); setStep(2); }}
          >
            Continue
          </button>
        </div>
      )}

      {/* ------------------------------------------------- step 2 */}
      {step === 2 && (
        <div className="card-pad space-y-4">
          <div>
            <span className="label">Therapist</span>
            <p className="mb-2 text-xs text-cocoa-400">
              Only therapists on duty and free at your chosen time are shown.
            </p>
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={() => setTherapistId('any')}
                className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  therapistId === 'any'
                    ? 'border-cocoa-600 bg-cocoa-50 font-medium'
                    : 'border-sand-200 bg-white'
                }`}
              >
                No preference
                <span className="block text-xs text-cocoa-400">
                  We&apos;ll assign the next therapist in the queue.
                </span>
              </button>
              {therapists.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTherapistId(t.id)}
                  className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    therapistId === t.id
                      ? 'border-cocoa-600 bg-cocoa-50 font-medium'
                      : 'border-sand-200 bg-white'
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {therapists.length === 0 && (
                <p className="text-sm text-cocoa-400">
                  Checking who&apos;s available…
                </p>
              )}
            </div>
          </div>

          <div className="block">
            <span className="label">
              {guests.length ? 'Choose your places' : 'Choose your place'}
            </span>
            {resourceId !== 'any' && (
              <FloorPlan
                plan={plan}
                // The real party, not a placeholder. Passing a party of one
                // here is what kept the couples rooms locked for a booking of
                // two: the picker only offers a whole-unit place to a party
                // that can fill it, and it was being told there was one of us.
                guests={[
                  { name: '', accepts, serviceLabel: chosen.map((x) => x.name).join(', ') },
                  ...guests.map((g, i) => ({
                    name: g.name.trim() || `Guest ${i + 2}`,
                    accepts: guestAccepts[i] ?? null,
                    serviceLabel: g.serviceIds
                      .map((id) => allServices.find((x) => x.id === id)?.name ?? '')
                      .filter(Boolean)
                      .join(', '),
                  })),
                ]}
                seats={seats}
                activeGuest={activeGuest}
                onSelectGuest={setActiveGuest}
                onPick={(id) =>
                  setSeats((prev) => {
                    const next = { ...prev };
                    if (next[activeGuest] === id) delete next[activeGuest];
                    else next[activeGuest] = id;
                    // Move to whoever still has nowhere to go, so a party of
                    // three is three taps rather than three taps and two
                    // clicks on the right name.
                    const total = guests.length + 1;
                    for (let k = 1; k <= total; k++) {
                      const j = (activeGuest + k) % total;
                      if (!next[j]) { setActiveGuest(j); break; }
                    }
                    return next;
                  })
                }
              />
            )}
            {/* Below the plan, not above it: the choice is "or just give me
                anything", and an escape hatch reads as one only after the thing
                it escapes from. */}
            <label className="mt-3 flex items-center gap-2 text-sm text-cocoa-700">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#6b4e35]"
                checked={resourceId === 'any'}
                onChange={(e) => {
                  setResourceId(e.target.checked ? 'any' : '');
                  if (e.target.checked) setSeats({});
                }}
              />
              {guests.length
                ? 'Any free places — let the spa choose'
                : 'Any free bed — let the spa choose'}
            </label>
          </div>

          {stranded && (
            <p className="text-sm text-clay-500">
              {stranded.name} takes {stranded.capacity}. Put another of your party in it, or
              choose somewhere else — otherwise a place is left that nobody can book.
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={Boolean(stranded)}
              onClick={() => setStep(3)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------- step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card-pad space-y-3">
            <p className="section-title">Your details</p>
            <label className="block">
              <span className="label">Full name *</span>
              <input className="input" value={client.name}
                onChange={(e) => setClient({ ...client, name: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Mobile number *</span>
                <input className="input" inputMode="tel" placeholder="0917 123 4567"
                  value={client.mobile}
                  onChange={(e) => setClient({ ...client, mobile: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Email *</span>
                <input className="input" type="email" placeholder="you@email.com"
                  value={client.email}
                  onChange={(e) => setClient({ ...client, email: e.target.value })} />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Birthday *</span>
                <input className="input" type="date" max={todayKey()} value={client.birthday}
                  onChange={(e) => setClient({ ...client, birthday: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">City *</span>
                <select className="select" value={client.addressCity}
                  onChange={(e) => setClient({ ...client, addressCity: e.target.value })}>
                  {CITIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Barangay (optional)</span>
                <input className="input" value={client.barangay}
                  onChange={(e) => setClient({ ...client, barangay: e.target.value })} />
              </label>
              <label className="block">
                <span className="label">Street / building (optional)</span>
                <input className="input" value={client.addressLine}
                  onChange={(e) => setClient({ ...client, addressLine: e.target.value })} />
              </label>
            </div>

            {profileFields.map((f) => (
              <IntakeField key={f.key} field={f} value={intake[f.key]}
                onChange={(v) => setIntake({ ...intake, [f.key]: v })} />
            ))}
          </div>

          <div className="card-pad space-y-3">
            <p className="section-title">Health checklist</p>
            <p className="muted">
              This keeps you safe — your therapist needs to know before the treatment. Tick
              anything that applies.
            </p>
            {medicalFields.map((f) => (
              <IntakeField key={f.key} field={f} value={intake[f.key]}
                onChange={(v) => setIntake({ ...intake, [f.key]: v })} />
            ))}
          </div>

          <div className="card-pad space-y-3">
            <label className="block">
              <span className="label">Notes for us (optional)</span>
              <textarea className="textarea" value={notes} rows={3}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else we should know?" />
            </label>
            <label className="block">
              <span className="label">Promo / partner code (optional)</span>
              <input className="input" value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())} />
            </label>

            <label className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#6b4e35]"
                checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-xs text-cocoa-600">
                I consent to ANICA Wellness Spa collecting and storing my personal and health
                information for my treatment, safety and booking records, in line with the
                Philippine Data Privacy Act of 2012 (RA 10173). My health details are visible
                only to spa staff and are never shared or exported.
              </span>
            </label>
          </div>

          <div className="card-pad space-y-2 border-cocoa-200 bg-cocoa-50">
            <p className="section-title">Summary</p>
            <dl className="space-y-1 text-sm">
              <Row label="Services" value={chosen.map((s) => s.name).join(', ')} />
              <Row label="Duration" value={`${totalMinutes} minutes`} />
              <Row label="Total price" value={formatPeso(totalPrice)} />
              <Row
                label={`Reservation fee (${catalog.depositPercent}%)`}
                value={formatPeso(deposit)}
                strong
              />
            </dl>
            <p className="text-xs text-cocoa-500">
              The reservation fee is deducted from your final bill. Unpaid bookings are
              released after {catalog.expiryMinutes} minutes.
            </p>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn-primary flex-1" disabled={!canSubmit || busy}
              onClick={submit}>
              {busy
                ? 'Please wait…'
                : catalog.manualFallback
                  ? 'Reserve & upload payment'
                  : `Pay ${formatPeso(deposit)} & reserve`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cocoa-500">{label}</dt>
      <dd className={`num text-right ${strong ? 'font-semibold text-cocoa-800' : 'text-cocoa-700'}`}>
        {value}
      </dd>
    </div>
  );
}

function IntakeField({
  field,
  value,
  onChange,
}: {
  field: Catalog['fields'][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'BOOLEAN') {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-sand-200 px-3 py-2">
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#6b4e35]"
          checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-sm text-cocoa-700">{field.label}</span>
      </label>
    );
  }
  if (field.type === 'SELECT') {
    return (
      <label className="block">
        <span className="label">{field.label}</span>
        <select className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {field.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'TEXTAREA') {
    return (
      <label className="block">
        <span className="label">{field.label}</span>
        <textarea className="textarea" rows={2} value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)} />
        {field.helpText && <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>}
      </label>
    );
  }
  return (
    <label className="block">
      <span className="label">{field.label}</span>
      <input className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      {field.helpText && <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>}
    </label>
  );
}
