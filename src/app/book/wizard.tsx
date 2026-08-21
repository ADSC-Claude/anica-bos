'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FloorPlan, type PlanPlace } from '@/components/floor-plan';
import { useRouter } from 'next/navigation';
import { formatPeso } from '@/lib/money';
import { VisitOrder } from '@/components/visit-order';
import { DateSelect } from '@/components/date-select';
import { houseOrder } from '@/lib/itinerary';
import { PRIVACY_CONSENT, WAIVER_CLAUSES, WAIVER_LEAD } from '@/lib/consent';
import { NOT_APPLICABLE, isAnswered, isNotApplicable } from '@/lib/intake';

type Catalog = {
  branches: { id: string; name: string; address: string }[];
  categories: {
    id: string;
    name: string;
    services: {
      id: string; name: string; durationMinutes: number; priceCents: number;
      sequenceRank: number; changeoverMinutes: number | null; isAddOn: boolean;
    }[];
  }[];
  fields: {
    key: string;
    label: string;
    section: 'PROFILE' | 'MEDICAL';
    type: string;
    options: string[];
    helpText: string;
    required: boolean;
    /** Only asked once this question has been ticked. */
    dependsOnKey: string | null;
    /** Ticking this one means none of the others apply. */
    isNoneOption: boolean;
  }[];
  depositPercent: number;
  /** House gap between two treatments in one visit. */
  changeoverMinutes: number;
  expiryMinutes: number;
  /** Finished sentence from the server — see lib/booking-policy.ts. */
  cancellationPolicy: string;
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

/** "1:30 PM" in Manila, for labelling a treatment's own slot. */
function clockOf(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

/** 'BED' as a guest would say it. */
const PLACE_WORDS: Record<string, string> = {
  BED: 'bed', ROOM: 'room', CHAIR: 'chair', SAUNA: 'sauna',
};

/**
 * Which treatment is keeping times off the list.
 *
 * A visit of two treatments needs two places, and when only one of them is
 * short there is nothing on screen to say which. The guest tries every date in
 * the calendar and finds the same empty list, because the sauna is booked all
 * afternoon and nobody told her.
 */
function BlockedNote({
  blocked,
  className = '',
}: {
  blocked: { treatment: string; placeType: string | null; freeAt: string | null }[];
  className?: string;
}) {
  if (!blocked.length) return null;
  return (
    <ul className={`space-y-0.5 text-[11px] leading-relaxed text-cocoa-500 ${className}`}>
      {blocked.slice(0, 3).map((b) => {
        const place = b.placeType ? PLACE_WORDS[b.placeType] ?? b.placeType.toLowerCase() : 'place';
        return (
          <li key={b.treatment}>
            <strong className="text-cocoa-700">{b.treatment}</strong>{' '}
            {b.freeAt
              ? `needs the ${place}, and it is taken until ${clockOf(b.freeAt)}.`
              : `needs a ${place}, and we have none free that day.`}
          </li>
        );
      })}
    </ul>
  );
}

function todayKey(): string {
  const now = new Date(Date.now() + 8 * 3600_000);
  return now.toISOString().slice(0, 10);
}

export function BookingWizard() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStepState] = useState(1);

  /**
   * Move between steps, leaving a trail the browser can walk.
   *
   * The steps live in one page, so without this the browser's Back button —
   * and the Back in the header — leave the booking entirely and throw away
   * everything typed. `pushState` keeps the React state exactly where it is
   * while giving Back somewhere sensible to land.
   */
  const setStep = (next: number) => {
    if (next === step) return;
    if (next > step) {
      window.history.pushState({ step: next }, '', `?step=${next}`);
      setStepState(next);
      return;
    }
    // Going back through a control rather than the browser button: rewind the
    // history rather than pushing, or Back would replay the steps just left.
    // The popstate handler is what actually moves the step, so the two routes
    // back cannot disagree.
    window.history.back();
  };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * The control a "Take me there" is currently pointing at.
   *
   * The nonce is not decoration: pressing the same fix twice must move the page
   * twice, and a bare string would be unchanged state the second time.
   */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusNonce = useRef(0);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus.id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus the field itself where there is one; a group of buttons or the floor
    // plan has nothing sensible to focus, so the outline is the whole signal.
    const field = el.matches('input,select,textarea')
      ? (el as HTMLElement)
      : el.querySelector<HTMLElement>('input,select,textarea');
    field?.focus({ preventScroll: true });
    const ring = ['ring-2', 'ring-clay-500', 'rounded-2xl'];
    el.classList.add(...ring);
    const t = setTimeout(() => el.classList.remove(...ring), 2200);
    return () => clearTimeout(t);
  }, [focus]);

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
  /** Why the day came back empty — a tick box, a shift, or genuinely full. */
  const [noSlotReason, setNoSlotReason] = useState('');
  /**
   * Which treatment kept the times off the list, and when its place comes back.
   *
   * A visit of two treatments needs two places, and when only one of them is
   * short the guest has no way of knowing which. "No free times" sends her
   * round every date in the calendar; "the sauna is taken until 2:30pm" tells
   * her what to do next.
   */
  const [blocked, setBlocked] = useState<
    { treatment: string; placeType: string | null; freeAt: string | null }[]
  >([]);
  /** The visit's real length in minutes, as the server plans it. */
  const [quotedMinutes, setQuotedMinutes] = useState<number | null>(null);
  /**
   * Minutes the guest has asked to wait before a treatment, by service id.
   *
   * Empty for almost every booking — one tap on a start time gives a visit with
   * the treatments as close together as the floor allows. This is for the guest
   * who wants lunch between her sauna and her massage and says so.
   */
  const [waits, setWaits] = useState<Record<string, number>>({});
  const [startAt, setStartAt] = useState('');
  const [therapists, setTherapists] = useState<{ id: string; name: string }[]>([]);
  const [resources, setResources] = useState<{ id: string; name: string; type: string }[]>([]);
  const [plan, setPlan] = useState<PlanPlace[]>([]);
  const [accepts, setAccepts] = useState<string[] | null>(null);
  const [guestAccepts, setGuestAccepts] = useState<(string[] | null)[]>([]);
  /**
   * Every treatment of every guest, each with the floor as it stands during its
   * own window.
   *
   * A place is chosen per *treatment*, not per person. Somebody booking a sauna
   * then a massage needs two of them, and the bed she wants at 2:05 may well be
   * occupied at 1:30 while she is in the sauna — so each leg is picked against
   * its own moment rather than against the whole visit.
   */
  const [legs, setLegs] = useState<{
    guestIndex: number;
    serviceId: string;
    name: string;
    startAt: string;
    endAt: string;
    accepts: string[] | null;
    plan: PlanPlace[];
  }[]>([]);
  const [therapistId, setTherapistId] = useState('any');
  const [resourceId, setResourceId] = useState('any');
  const [slotInfo, setSlotInfo] = useState<{ priceCents: number; depositCents: number } | null>(null);

  const [client, setClient] = useState({
    name: '', mobile: '', email: '', birthday: '',
    addressCity: 'Quezon City', addressLine: '', barangay: '',
  });
  /**
   * Whether this guest says she has been here before, and whether we agree.
   *
   * `claim` is what she pressed; `found` is what the server said when it was
   * asked. They are separate because pressing "I'm a returning client" must
   * not on its own skip anything — the details come off the form only once the
   * number and the name have actually matched a record.
   */
  const [claim, setClaim] = useState<'new' | 'returning'>('new');
  const [found, setFound] = useState<'unknown' | 'checking' | 'yes' | 'no'>('unknown');
  const recognised = claim === 'returning' && found === 'yes';

  const [intake, setIntake] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [waiver, setWaiver] = useState(false);

  // Step 1 is the page's own history entry, and Back from it should leave for
  // the landing page — so the URL is cleaned rather than pushed on mount. A
  // reload lands on step 1 with an empty form, which is what a reload means.
  useEffect(() => {
    window.history.replaceState({ step: 1 }, '', window.location.pathname);
    const onPop = (e: PopStateEvent) => {
      const to = Number((e.state as { step?: number } | null)?.step ?? 1);
      setStepState(Number.isFinite(to) && to >= 1 ? to : 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
  /**
   * `svcA:15,svcB:30` — only the treatments she has actually pushed later.
   *
   * Keyed by service so it survives reordering: a wait belongs to the treatment
   * she wants later, not to a position in the list.
   */
  const waitParam = useMemo(
    () =>
      serviceIds
        .filter((id) => (waits[id] ?? 0) > 0)
        .map((id) => `${id}:${waits[id]}`)
        .join(','),
    [serviceIds, waits],
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
      // Must-fill places only. The sauna is exclusive without being must-fill:
      // one guest booking it alone strands nothing, she simply has it to
      // herself until she leaves.
      if (!p.fillWhole) continue;
      const ours = chosenIds.filter((id) => id === p.id).length;
      if (ours > 0 && ours + p.taken < p.capacity) return p;
    }
    return null;
  }, [seats, plan, resourceId]);
  // In *visit* order, not catalogue order — the list is reorderable and the
  // schedule, the summary and the API all key off this sequence.
  const chosen = serviceIds
    .map((id) => allServices.find((s) => s.id === id))
    .filter(Boolean) as typeof allServices;
  /**
   * Door to door, gaps included — the number the server plans with.
   *
   * Adding up the treatments alone quotes a sauna and a massage as 90 minutes
   * when the floor gives up 95, and the guest reads a finish time she will not
   * meet. The API already computes this properly, so the summary uses its
   * answer and only falls back to the raw sum before the first reply lands.
   */
  const totalMinutes =
    quotedMinutes ?? chosen.reduce((a, s) => a + s.durationMinutes, 0);
  const totalPrice = chosen.reduce((a, s) => a + s.priceCents, 0);
  const deposit = slotInfo?.depositCents ?? Math.round((totalPrice * (catalog?.depositPercent ?? 30)) / 100);

  /**
   * A different service or a different day means the chosen time is gone.
   *
   * Asking for a break does *not*: she picked three o'clock and still wants
   * three o'clock, only with lunch in the middle. Clearing it here as well
   * would take her slot away every time she tapped +, which is a strange
   * punishment for using the control.
   */
  useEffect(() => {
    setStartAt('');
  }, [serviceIds, dateKey, guestParam]);

  // Load the day's slots whenever the service, the day or the visit changes.
  useEffect(() => {
    if (!partyReady || !dateKey || !branchId) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlots(null);
    setNoSlotReason('');
    setBlocked([]);
    setQuotedMinutes(null);
    const params = new URLSearchParams({ branchId, date: dateKey, serviceIds: serviceIds.join(',') });
    if (guestParam) params.set('guests', guestParam);
    if (waitParam) params.set('waits', waitParam);
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setSlots(data.slots ?? []);
        setNoSlotReason(data.reason?.message ?? '');
        setBlocked(data.blocked ?? []);
        if (typeof data.durationMinutes === 'number') setQuotedMinutes(data.durationMinutes);
        // A longer visit may no longer fit where it did. Rather than leave her
        // holding a time the floor has stopped offering, let it go and say so
        // by simply not having it selected.
        setStartAt((at) =>
          at && (data.slots ?? []).some((s: { startAt: string }) => s.startAt === at) ? at : '',
        );
      })
      .catch(() => !cancelled && setError('Could not check availability. Please try again.'));
    return () => { cancelled = true; };
  }, [serviceIds, dateKey, branchId, guestParam, waitParam, partyReady]);

  // Load therapists/rooms for the picked slot.
  useEffect(() => {
    if (!startAt) return;
    const params = new URLSearchParams({
      branchId, date: dateKey, serviceIds: serviceIds.join(','), startAt,
    });
    if (guestParam) params.set('guests', guestParam);
    if (waitParam) params.set('waits', waitParam);
    fetch(`/api/public/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setTherapists(data.therapists ?? []);
        setResources(data.resources ?? []);
        setPlan(data.plan ?? []);
        setAccepts(data.accepts ?? null);
        setGuestAccepts(data.guestAccepts ?? []);
        setLegs(data.legs ?? []);
        setSeats({});
        setActiveGuest(0);
        setSlotInfo({ priceCents: data.priceCents, depositCents: data.depositCents });
        setTherapistId('any');
        setResourceId('any');
      })
      .catch(() => setError('Could not load therapists for that time.'));
  }, [startAt, branchId, dateKey, serviceIds, guestParam, waitParam]);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId, serviceIds, startAtIso: startAt,
          // Only sent when she actually asked for a break.
          ...(Object.keys(waits).length ? { waits } : {}),
          therapistId: therapistId === 'any' ? null : therapistId,
          // The first leg's place, kept for the appointment row itself.
          resourceId: resourceId === 'any' ? null : (placeFor(0, 0) ?? null),
          // And one per treatment — a sauna leg in the sauna, a massage leg on
          // a bed. The server places anything left null.
          placeByService: resourceId === 'any' ? undefined : placesForGuest(0),
          client, intake, notes, consent, waiver, promoCode: promoCode || undefined,
          guests: guests.map((g, i) => ({
            name: g.name.trim(),
            serviceIds: g.serviceIds,
            resourceId: resourceId === 'any' ? null : (placeFor(i + 1, 0) ?? null),
            placeByService: resourceId === 'any' ? undefined : placesForGuest(i + 1),
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
  /**
   * The health checklist, in three parts.
   *
   * The ticks come first, each with its follow-up tucked underneath and shown
   * only once it is ticked. "None of the above" goes last, because it is the
   * answer you give after reading the rest. The written answers — allergies,
   * anything else — come after the list.
   */
  const followUps = medicalFields.filter((f) => f.dependsOnKey);
  const noneField = medicalFields.find((f) => f.isNoneOption);
  const ticks = medicalFields.filter(
    (f) => f.type === 'BOOLEAN' && !f.dependsOnKey && !f.isNoneOption,
  );
  /**
   * The free-text questions — allergies, anything else — which get the N/A
   * escape and so are the ones that have to be answered.
   *
   * Type-checked rather than "everything that is not a tick box": the Owner can
   * add a dropdown to the health section from Settings, and a dropdown handed
   * the N/A treatment would render as a plain text box and lose its options.
   * It also has a blank of its own already, so it needs no waive-off.
   */
  const written = medicalFields.filter(
    (f) => (f.type === 'TEXT' || f.type === 'TEXTAREA') && !f.dependsOnKey && !f.isNoneOption,
  );
  /** Anything else the Owner has added — a dropdown, a number — as it comes. */
  const otherAsked = medicalFields.filter(
    (f) =>
      f.type !== 'BOOLEAN' && f.type !== 'TEXT' && f.type !== 'TEXTAREA' &&
      !f.dependsOnKey && !f.isNoneOption,
  );

  /**
   * Tick a condition and "none of the above" lets go; tick that and every
   * condition does, along with the answers they had revealed.
   *
   * Leaving a typed answer behind under an unticked box would put a sentence
   * about last year's surgery on a record that says there was none.
   */
  const setMedical = (key: string, value: unknown) => {
    const next = { ...intake, [key]: value };
    if (noneField && key === noneField.key && value) {
      for (const f of [...ticks, ...followUps]) delete next[f.key];
    } else if (noneField && value && key !== noneField.key) {
      delete next[noneField.key];
    }
    if (!value) {
      // Untick the condition, drop what it asked about.
      for (const f of followUps.filter((x) => x.dependsOnKey === key)) delete next[f.key];
    }
    setIntake(next);
  };
  /**
   * The checklist counts as answered when the guest has said something.
   *
   * A condition ticked says it; "None of the above" says it just as well, which
   * is what that box is for. What does not say it is an untouched list — and an
   * untouched list is the one case a therapist cannot act on, because it reads
   * identically whether the guest is in perfect health or simply scrolled past.
   */
  const checklistAnswered =
    ticks.some((f) => Boolean(intake[f.key])) || Boolean(noneField && intake[noneField.key]);

  const profileFields = catalog.fields.filter((f) => f.section === 'PROFILE');

  /**
   * Everything still missing, in one list.
   *
   * A greyed-out Continue that will not say why is the worst control on a form:
   * the guest can see the button, cannot press it, and has to hunt for what they
   * missed. Worse, it was not even greyed out — a party of four could reach
   * Continue with the fourth person unplaced, because the gate only checked the
   * booker.
   *
   * So every requirement is written down once, with the step it belongs to and
   * the control that fixes it. The red panel lists them, the button is disabled
   * while any remain, and "Take me there" walks the guest to the exact field —
   * across steps if need be, since forgetting a guest's treatment on step 1 is
   * something you only notice on step 2.
   */
  const seatNames = ['You', ...guests.map((g, i) => g.name.trim() || `Guest ${i + 2}`)];
  const partyAccepts = [accepts, ...guestAccepts];

  /** The place chosen for one guest's nth treatment, if any. */
  const placeFor = (guestIndex: number, nth: number) => {
    const idx = legs.findIndex((l) => l.guestIndex === guestIndex);
    return idx < 0 ? null : seats[idx + nth] ?? null;
  };
  /** serviceId → place, for one guest. Only the legs actually chosen. */
  const placesForGuest = (guestIndex: number) => {
    const out: Record<string, string | null> = {};
    legs.forEach((l, i) => {
      if (l.guestIndex === guestIndex && seats[i]) out[l.serviceId] = seats[i];
    });
    return Object.keys(out).length ? out : undefined;
  };

  const blockers: {
    /** What is missing, addressed to the person booking. */
    message: string;
    /** Which step fixes it. */
    step: number;
    /** The element to scroll to and focus. */
    anchor: string;
    /** Whose place is missing, for the floor plan's guest chips. */
    guest?: number;
  }[] = [];

  if (!serviceIds.length) {
    blockers.push({ message: 'Choose your own treatment.', step: 1, anchor: 'pick-service' });
  }
  guests.forEach((g, i) => {
    if (!g.name.trim()) {
      blockers.push({
        message: `Tell us who guest ${i + 2} is — a first name is enough.`,
        step: 1,
        anchor: `guest-${i}-name`,
      });
    }
    if (!g.serviceIds.length) {
      blockers.push({
        message: `Choose a treatment for ${g.name.trim() || `guest ${i + 2}`}.`,
        step: 1,
        anchor: `guest-${i}-service`,
      });
    }
  });
  if (partyReady && !startAt) {
    blockers.push({ message: 'Pick a start time.', step: 1, anchor: 'pick-time' });
  }

  // Step 2: everyone needs somewhere to lie, sit or sweat — unless the guest has
  // handed the whole choice back to the spa.
  if (resourceId !== 'any') {
    legs.forEach((leg, i) => {
      if (seats[i]) return;
      const who = leg.guestIndex === 0
        ? 'You have'
        : `${guests[leg.guestIndex - 1]?.name.trim() || `Guest ${leg.guestIndex + 1}`} has`;
      blockers.push({
        // Named by treatment: "you have no place yet" is a puzzle when the
        // visit has three of them and only the sauna leg is missing one.
        message: legs.length > 1
          ? `${who} no place for ${leg.name} at ${clockOf(leg.startAt)}.`
          : `${who} no place yet.`,
        step: 2,
        anchor: 'floor-plan',
        guest: i,
      });
    });
    if (stranded) {
      // Point at whoever could still finish the room, so "Take me there" lands
      // on a guest who can actually click the empty bed.
      const filler = seatNames.findIndex(
        (_, i) =>
          seats[i] !== stranded.id &&
          (!partyAccepts[i] || partyAccepts[i]!.includes(stranded.type)),
      );
      blockers.push({
        message:
          `${stranded.name} takes ${stranded.capacity} and is sold whole. Put another of ` +
          'your party in it, or move out of it — otherwise a place is left that nobody can book.',
        step: 2,
        anchor: 'floor-plan',
        guest: filler >= 0 ? filler : undefined,
      });
    }
  }

  const details: [boolean, string, string][] = [
    [client.name.trim().length > 1, 'We need your full name.', 'detail-name'],
    [client.mobile.replace(/\D/g, '').length > 6, 'We need a mobile number to reach you.', 'detail-mobile'],
    // A guest we recognised has already given these, and the fields are not on
    // screen to fix — so requiring them would be an instruction she cannot
    // follow. The server checks the same thing again before trusting it.
    [recognised || /\S+@\S+\.\S+/.test(client.email), 'We need an email for your confirmation.', 'detail-email'],
    [recognised || Boolean(client.birthday), 'We need your birthday.', 'detail-birthday'],
    [recognised || Boolean(client.addressCity), 'Choose your city.', 'detail-city'],
    [consent, 'Please tick the consent box so we can keep your booking.', 'detail-consent'],
    [waiver, 'Please tick the treatment consent box before we reserve your slot.', 'detail-waiver'],
    [
      checklistAnswered,
      'Please answer the health checklist — tick anything that applies, or "None of the above".',
      'health-checklist',
    ],
    // Each written question separately, so the guest is told which one is
    // short rather than being sent back to the section to hunt for it.
    ...written.map(
      (f) =>
        [
          isAnswered(intake[f.key]),
          `Please answer "${f.label}", or tick N/A if it does not apply.`,
          `medical-${f.key}`,
        ] as [boolean, string, string],
    ),
  ];
  for (const [ok, message, anchor] of details) {
    if (!ok) blockers.push({ message, step: 3, anchor });
  }

  const blocking = (s: number) => blockers.filter((b) => b.step <= s);

  /**
   * Walk the guest to the control that fixes it.
   *
   * The step change and the scroll cannot happen in one go — the field does not
   * exist until the step has rendered — so the anchor is parked in state and an
   * effect does the moving once it is on screen. The nonce is what lets the same
   * field be pointed at twice in a row.
   */
  const goFix = (b: { step: number; anchor: string; guest?: number }) => {
    setError('');
    if (b.guest !== undefined) setActiveGuest(b.guest);
    if (b.step !== step) setStep(b.step);
    setFocus({ id: b.anchor, n: focusNonce.current++ });
  };

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

      {/* What is still missing, and a way straight to it. Rendered at the top of
          every step rather than only beside the button, because on a phone the
          button and the field that blocks it are rarely on screen together. */}
      {(() => {
        const here = blocking(step);
        // Quiet until the guest has actually started. A checklist of three red
        // items on a form nobody has touched yet reads as a telling-off.
        const started = step > 1 || serviceIds.length > 0 || guests.length > 0;
        if (!here.length || !started) return null;
        return (
          <div
            role="alert"
            className="rounded-xl border border-clay-500/30 bg-clay-500/10 px-3 py-2.5"
          >
            <p className="text-sm font-semibold text-clay-500">
              {here.length === 1 ? 'One thing left' : `${here.length} things left`} before you can
              continue
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {here.map((b, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm text-clay-500">{b.message}</span>
                  <button
                    type="button"
                    onClick={() => goFix(b)}
                    className="shrink-0 text-xs font-semibold text-cocoa-700 underline underline-offset-2 hover:text-cocoa-900"
                  >
                    Take me there
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

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

          <div id="pick-service">
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
                            setServiceIds((prev) => {
                              if (prev.includes(s.id)) return prev.filter((x) => x !== s.id);
                              // Dropped in where the spa usually runs it, so a
                              // sauna ticked after a massage still comes first.
                              const picked = [...prev, s.id]
                                .map((id) => allServices.find((x) => x.id === id))
                                .filter(Boolean) as typeof allServices;
                              return houseOrder(
                                picked.map((x) => ({
                                  serviceId: x.id,
                                  name: x.name,
                                  durationMinutes: x.durationMinutes,
                                  changeoverMinutes: x.changeoverMinutes,
                                  sequenceRank: x.sequenceRank,
                                })),
                              ).map((t) => t.serviceId);
                            })
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

          {chosen.length > 1 && (
            <VisitOrder
              treatments={chosen.map((x) => ({
                serviceId: x.id,
                name: x.name,
                durationMinutes: x.durationMinutes,
                changeoverMinutes: x.changeoverMinutes,
                sequenceRank: x.sequenceRank,
                isAddOn: x.isAddOn,
                gapBefore: waits[x.id] ?? 0,
              }))}
              changeoverMinutes={catalog.changeoverMinutes ?? 15}
              startAt={startAt ? new Date(startAt) : null}
              onReorder={(next) => setServiceIds(next.map((t) => t.serviceId))}
              onWait={(serviceId, minutes) =>
                setWaits((prev) => {
                  const next = { ...prev };
                  if (minutes > 0) next[serviceId] = minutes;
                  else delete next[serviceId];
                  return next;
                })
              }
            />
          )}

          {/* One block per guest. Deliberately the same service buttons as the
              booker's, because "the same list, for Nina" is a thing anyone can
              follow without instructions. */}
          {guests.map((g, i) => (
            <div key={i} className="rounded-2xl border border-sand-200 bg-sand-50 p-3">
              <label className="block">
                <span className="label">Guest {i + 2} — name</span>
                <input
                  id={`guest-${i}-name`}
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
              <div className="mt-2" id={`guest-${i}-service`}>
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

              <div id="pick-time">
                <span className="label">Available start times (12nn – 12mn)</span>
                {slots === null ? (
                  <p className="text-sm text-cocoa-400">Checking availability…</p>
                ) : slots.length === 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-clay-500">
                      {noSlotReason || 'No free times left that day. Please try another date.'}
                    </p>
                    <BlockedNote blocked={blocked} />
                  </div>
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
                {/* Times *are* on offer, but earlier ones were held back and the
                    guest cannot see why. Saying which treatment did it turns a
                    thin list into an explained one. */}
                {slots !== null && slots.length > 0 && <BlockedNote blocked={blocked} className="mt-2" />}
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
            disabled={blocking(1).length > 0}
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

          <div className="block" id="floor-plan">
            <span className="label">
              {guests.length || legs.length > 1 ? 'Choose your places' : 'Choose your place'}
            </span>
            {resourceId !== 'any' && legs.length > 0 && (
              <FloorPlan
                // The floor during *this* treatment's window, not the whole
                // visit's. A bed busy while she is in the sauna is still hers
                // to book for the massage afterwards.
                plan={legs[activeGuest]?.plan ?? plan}
                // One entry per treatment rather than per person. A sauna and a
                // massage are two places at two times, and asking for one was
                // what greyed the sauna out and offered only beds.
                guests={legs.map((leg) => ({
                  name: leg.guestIndex === 0
                    ? 'You'
                    : guests[leg.guestIndex - 1]?.name.trim() || `Guest ${leg.guestIndex + 1}`,
                  accepts: leg.accepts,
                  serviceLabel: `${leg.name} · ${clockOf(leg.startAt)}`,
                }))}
                seats={seats}
                activeGuest={activeGuest}
                onSelectGuest={setActiveGuest}
                onPick={(id) =>
                  setSeats((prev) => {
                    const next = { ...prev };
                    if (next[activeGuest] === id) delete next[activeGuest];
                    else next[activeGuest] = id;
                    // Move on to whatever still has nowhere to go, so a visit
                    // of three treatments is three taps rather than three taps
                    // and two clicks on the right name.
                    for (let k = 1; k <= legs.length; k++) {
                      const j = (activeGuest + k) % legs.length;
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
              {/* "bed" is only right for one guest having one bed treatment.
                  A sauna and a massage are two places, and a party is more. */}
              {guests.length || legs.length > 1
                ? 'Any free places — let the spa choose'
                : 'Any free bed — let the spa choose'}
            </label>
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={blocking(2).length > 0}
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

            {/* Asked before the fields rather than after, because the answer
                decides how many of them there are. */}
            <div className="space-y-2">
              <span className="label">Have you been to us before? *</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ['new', "I'm a new client"],
                  ['returning', "I've been here before"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setClaim(value); setFound('unknown'); }}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                      claim === value
                        ? 'border-gilt-500 bg-sand-50 text-cocoa-800'
                        : 'border-sand-200 text-cocoa-600 hover:border-sand-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="label">Full name *</span>
              <input id="detail-name" className="input" value={client.name}
                onChange={(e) => { setClient({ ...client, name: e.target.value }); setFound('unknown'); }} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Mobile number *</span>
                <input id="detail-mobile" className="input" inputMode="tel" placeholder="0917 123 4567"
                  value={client.mobile}
                  onChange={(e) => { setClient({ ...client, mobile: e.target.value }); setFound('unknown'); }} />
              </label>
              {!recognised && (
                <label className="block">
                  <span className="label">Email *</span>
                  <input id="detail-email" className="input" type="email" placeholder="you@email.com"
                    value={client.email}
                    onChange={(e) => setClient({ ...client, email: e.target.value })} />
                </label>
              )}
            </div>

            {/* The lookup answers yes or no and nothing else — it never shows a
                name back, because an unauthenticated endpoint that confirms
                "0917… belongs to Maria S." is a directory of your clients. */}
            {claim === 'returning' && !recognised && (
              <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={
                    found === 'checking' ||
                    client.name.trim().length < 2 ||
                    client.mobile.replace(/\D/g, '').length < 7
                  }
                  onClick={async () => {
                    setFound('checking');
                    try {
                      const res = await fetch('/api/public/returning', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          branchId, name: client.name, mobile: client.mobile,
                        }),
                      });
                      const data = await res.json().catch(() => ({ known: false }));
                      setFound(data.known ? 'yes' : 'no');
                    } catch {
                      setFound('no');
                    }
                  }}
                >
                  {found === 'checking' ? 'Checking…' : 'Find my details'}
                </button>
                {found === 'no' && (
                  <p className="mt-2 text-xs text-cocoa-600">
                    We could not match that name and number. Check them, or just fill in the
                    form below — either way your booking goes through.
                  </p>
                )}
                {found === 'unknown' && (
                  <p className="mt-2 text-xs text-cocoa-500">
                    Enter the name and mobile number you booked with last time, and we will
                    fill in the rest.
                  </p>
                )}
              </div>
            )}

            {recognised && (
              <div className="rounded-xl border border-gilt-500 bg-sand-50 p-3">
                <p className="text-sm font-medium text-cocoa-800">Welcome back.</p>
                <p className="mt-1 text-xs text-cocoa-600">
                  We have your contact details on file — just the health questions below, since
                  those can change between visits.{' '}
                  <button type="button" className="underline underline-offset-4"
                    onClick={() => { setClaim('new'); setFound('unknown'); }}>
                    Enter them again
                  </button>
                  .
                </p>
              </div>
            )}

            {!recognised && (
            <>
            <div className="grid gap-3 sm:grid-cols-2">
              {/* A div, not a label: a label points at one control and this
                  is three. The id stays here so "Take me there" can still find
                  and outline the whole group. */}
              <div className="block" id="detail-birthday">
                <span className="label">Birthday *</span>
                <DateSelect
                  value={client.birthday}
                  latestYear={new Date(Date.now() + 8 * 3600_000).getUTCFullYear()}
                  earliestYear={new Date(Date.now() + 8 * 3600_000).getUTCFullYear() - 100}
                  onChange={(v) => setClient({ ...client, birthday: v })}
                />
              </div>
              <label className="block">
                <span className="label">City *</span>
                <select id="detail-city" className="select" value={client.addressCity}
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
            </>
            )}

            {profileFields.map((f) => (
              <IntakeField key={f.key} field={f} value={intake[f.key]}
                onChange={(v) => setIntake({ ...intake, [f.key]: v })} />
            ))}
          </div>

          <div className="card-pad space-y-3" id="health-checklist">
            <p className="section-title">Health checklist</p>
            <p className="muted">
              This keeps you safe — your therapist needs to know before the treatment. Tick
              anything that applies, or &ldquo;None of the above&rdquo;.
            </p>
            {ticks.map((f) => (
              <div key={f.key} className="space-y-2">
                <IntakeField field={f} value={intake[f.key]}
                  onChange={(v) => setMedical(f.key, v)} />
                {/* Indented and hairlined, so it reads as part of the answer
                    above it rather than as another question in the list. */}
                {Boolean(intake[f.key]) &&
                  followUps
                    .filter((d) => d.dependsOnKey === f.key)
                    .map((d) => (
                      <div key={d.key} className="ml-3 border-l-2 border-sand-200 pl-3">
                        <IntakeField field={d} value={intake[d.key]}
                          onChange={(v) => setMedical(d.key, v)} />
                      </div>
                    ))}
              </div>
            ))}

            {noneField && (
              <IntakeField field={noneField} value={intake[noneField.key]}
                onChange={(v) => setMedical(noneField.key, v)} />
            )}

            {written.map((f) => (
              <div key={f.key} id={`medical-${f.key}`}>
                <IntakeField field={f} value={intake[f.key]}
                  onChange={(v) => setIntake({ ...intake, [f.key]: v })}
                  onNotApplicable={(on) =>
                    setIntake({ ...intake, [f.key]: on ? NOT_APPLICABLE : '' })
                  } />
              </div>
            ))}

            {otherAsked.map((f) => (
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

            <label id="detail-consent" className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#6b4e35]"
                checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span className="text-xs text-cocoa-600">{PRIVACY_CONSENT}</span>
            </label>

            {/* Its own box, below the privacy one: this is the client agreeing
                to the treatment and its risks, which is a different thing to
                agree to and has to be provable on its own. */}
            <label id="detail-waiver" className="flex items-start gap-3 rounded-xl bg-sand-100 p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#6b4e35]"
                checked={waiver} onChange={(e) => setWaiver(e.target.checked)} />
              <span className="text-xs text-cocoa-600">
                {WAIVER_LEAD}
                <span className="mt-1.5 block space-y-1.5">
                  {WAIVER_CLAUSES.map((clause) => (
                    <span key={clause} className="flex gap-1.5">
                      <span aria-hidden>•</span>
                      <span>{clause}</span>
                    </span>
                  ))}
                </span>
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

          {/* The cancellation rule, on the step with the pay button rather than
              behind a link. A guest who only learns the fee was non-refundable
              after losing it was never really told. */}
          {catalog.cancellationPolicy && (
            <div className="rounded-xl border border-sand-200 bg-sand-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cocoa-500">
                Cancellations &amp; no-shows
              </p>
              <p className="mt-1 text-xs leading-relaxed text-cocoa-600">
                {catalog.cancellationPolicy}
              </p>
            </div>
          )}

          {/* The same reason, again, beside the button it is stopping.
              The checklist at the top of the step is where the detail lives,
              but by the time a guest has filled in a long form it is a screen
              and a half away, and a dead button with no explanation next to it
              reads as the site being broken. */}
          {blocking(3).length > 0 && (
            <p className="text-sm text-clay-500">
              <strong>
                {blocking(3).length === 1
                  ? 'One thing left:'
                  : `${blocking(3).length} things left, starting with:`}
              </strong>{' '}
              {blocking(3)[0].message}{' '}
              <button
                type="button"
                onClick={() => goFix(blocking(3)[0])}
                className="font-semibold text-cocoa-700 underline underline-offset-2 hover:text-cocoa-900"
              >
                Take me there
              </button>
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn-primary flex-1"
              disabled={blocking(3).length > 0 || busy}
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
  onNotApplicable,
}: {
  field: Catalog['fields'][number];
  value: unknown;
  onChange: (v: unknown) => void;
  /** Present on the written questions that have to be answered one way or the other. */
  onNotApplicable?: (on: boolean) => void;
}) {
  const na = isNotApplicable(value);
  const inputId = `intake-${field.key}`;

  /**
   * A written question that can be waved off, with "N/A" beside its label.
   *
   * Beside the question rather than under the box: it is an answer to that
   * question, and a guest with none to give should be able to say so without
   * first working out what to type. Ticking it empties and locks the box, so
   * the record cannot end up claiming both "nothing to report" and a sentence
   * about a nut allergy.
   *
   * A div rather than a label, unlike every other field here: the N/A tick
   * needs a label of its own, one label cannot live inside another, and if it
   * did the click would land on the text box instead of the tick.
   */
  if (onNotApplicable) {
    const Box = field.type === 'TEXTAREA' ? 'textarea' : 'input';
    return (
      <div className="block">
        <span className="flex items-baseline justify-between gap-3">
          <label className="label" htmlFor={inputId}>{field.label}</label>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pb-1 text-xs text-cocoa-500">
            <input type="checkbox" className="h-4 w-4 accent-[#6b4e35]"
              checked={na} onChange={(e) => onNotApplicable(e.target.checked)} />
            N/A
          </label>
        </span>
        <Box
          id={inputId}
          className={field.type === 'TEXTAREA' ? 'textarea' : 'input'}
          {...(field.type === 'TEXTAREA' ? { rows: 2 } : {})}
          disabled={na}
          value={na ? '' : String(value ?? '')}
          placeholder={na ? 'Nothing to report' : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onChange(e.target.value)}
        />
        {field.helpText && (
          <span className="mt-1 block text-[11px] text-cocoa-400">{field.helpText}</span>
        )}
      </div>
    );
  }

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
