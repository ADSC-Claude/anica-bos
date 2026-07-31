'use client';

/**
 * Choose a place by looking at the room, not by reading a dropdown.
 *
 * A cinema seat map earns its keep because the seats differ — row, aisle, view.
 * Beds mostly do not, so the value here is not choosing *which* bed but seeing
 * the shape of the place: that Room 1 holds two beds side by side is the thing
 * a couple actually wants to know, and "Room 1 (Couples)" in a select never
 * tells them.
 *
 * Taken places are drawn struck through with the time they free up rather than
 * hidden, because "why can I not have that one" is a question worth answering
 * before it is asked.
 */

export type PlanPlace = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  exclusiveUse: boolean;
  taken: number;
  remaining: number;
  heldByOther: boolean;
  freeFromIso: string | null;
};

export type PlanGuest = {
  /** Blank for the person booking. */
  name: string;
  /** What their treatments need: ROOM/BED, CHAIR, SAUNA — or null for anything. */
  accepts: string[] | null;
  serviceLabel: string;
};

function shortTime(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

/** Room 1 and Room 2 are beds; the label should not make a guest guess. */
function zoneLabel(type: string): string {
  switch (type) {
    case 'ROOM': return 'Private room';
    case 'BED': return 'Open beds';
    case 'CHAIR': return 'Foot spa & reflexology';
    case 'SAUNA': return 'Sauna';
    default: return 'Other';
  }
}

export function FloorPlan({
  plan,
  guests,
  seats,
  activeGuest,
  onSelectGuest,
  onPick,
}: {
  plan: PlanPlace[];
  guests: PlanGuest[];
  /** guest index → place id */
  seats: Record<number, string>;
  activeGuest: number;
  onSelectGuest: (i: number) => void;
  onPick: (placeId: string) => void;
}) {
  const party = guests.length;
  const guest = guests[activeGuest];

  /** Which of our party are in a place, in guest order. */
  const occupantsOf = (placeId: string) =>
    guests.map((_, i) => i).filter((i) => seats[i] === placeId);

  /**
   * The state of one *place inside* a resource, not of the resource.
   *
   * A couples room holds two, and drawing it as a single box was the bug: one
   * of you could be put in it and the other could not, so a room the pair had
   * come for looked taken by their own booking.
   */
  function stateOfSlot(p: PlanPlace, k: number) {
    // Places already sold to somebody else fill up from the left.
    if (k < p.taken) return p.heldByOther ? ('held' as const) : ('full' as const);

    const occupants = occupantsOf(p.id);
    const occupant = occupants[k - p.taken];
    if (occupant === activeGuest) return 'mine-active' as const;
    if (occupant !== undefined) return 'mine' as const;

    if (p.heldByOther) return 'held' as const;
    if (guest?.accepts && !guest.accepts.includes(p.type)) return 'wrong-type' as const;
    // A whole-unit place only opens to a party that can fill it — but once one
    // of us is inside, the rest may join rather than being told it is too big.
    if (p.exclusiveUse && p.taken === 0 && occupants.length === 0 && party < p.capacity) {
      return 'needs-more' as const;
    }
    return 'free' as const;
  }

  /**
   * What to call one place inside a resource.
   *
   * "Room 1 (Private)" twice tells a couple nothing; "Bed 1" and "Bed 2" under
   * a heading that already says Room 1 tells them exactly what they are
   * choosing between.
   */
  function slotLabel(p: PlanPlace, k: number) {
    if (p.capacity === 1) return p.name;
    if (p.type === 'ROOM') return `Bed ${k + 1}`;
    if (p.type === 'CHAIR') return `Chair ${k + 1}`;
    if (p.type === 'SAUNA') return `Place ${k + 1}`;
    return `${p.name} ${k + 1}`;
  }

  // Group by kind, keeping each room its own box so two beds read as a pair.
  const zones: { key: string; label: string; places: PlanPlace[] }[] = [];
  for (const p of plan) {
    const key = p.type === 'ROOM' ? p.id : p.type;
    const found = zones.find((z) => z.key === key);
    if (found) found.places.push(p);
    else zones.push({ key, label: p.type === 'ROOM' ? p.name : zoneLabel(p.type), places: [p] });
  }

  return (
    <div>
      {party > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {guests.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelectGuest(i)}
              aria-pressed={i === activeGuest}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs transition ${
                i === activeGuest
                  ? 'border-cocoa-600 bg-cocoa-600 text-white'
                  : 'border-sand-300 bg-white text-cocoa-700'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === activeGuest ? 'bg-white text-cocoa-700' : 'bg-sand-200 text-cocoa-700'
                }`}
              >
                {seats[i] ? '✓' : i + 1}
              </span>
              <span>
                {g.name || 'You'}
                <span
                  className={`block text-[10px] ${
                    i === activeGuest ? 'text-sand-200' : 'text-cocoa-400'
                  }`}
                >
                  {g.serviceLabel}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {party > 1 && (
        <p className="mb-3 text-[11px] text-cocoa-500">
          Choose a place for <strong>{guest?.name || 'you'}</strong>.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {zones.map((z) => (
          <div
            key={z.key}
            className={`rounded-2xl border p-3 ${
              z.places.every((p) => stateOfSlot(p, p.taken) === 'needs-more')
                ? 'border-dashed border-sand-300 bg-sand-50'
                : 'border-sand-200 bg-white'
            }`}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cocoa-400">
              {z.label}
            </p>
            {z.places.every((p) => stateOfSlot(p, p.taken) === 'needs-more') && (
              <p className="mb-2 text-[10px] leading-tight text-clay-500">
                Takes {z.places[0].capacity} — a smaller booking would leave a place nobody
                else can use.
              </p>
            )}
            {z.places.some((p) => stateOfSlot(p, p.taken) === 'held') && (
              <p className="mb-2 text-[10px] leading-tight text-clay-500">
                Another booking is inside
                {z.places[0].freeFromIso ? ` until ${shortTime(z.places[0].freeFromIso)}` : ''} —
                this one is not shared.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {z.places.flatMap((p) =>
                // One box per place the resource holds. A couples room draws
                // two beds, the chair area draws its chairs — drawing the
                // resource as a single box is what stopped a pair booking the
                // room they came for.
                Array.from({ length: Math.max(1, p.capacity) }, (_, k) => {
                  const state = stateOfSlot(p, k);
                  const mine = state === 'mine' || state === 'mine-active';
                  const disabled = !mine && state !== 'free';
                  const occupants = occupantsOf(p.id);
                  const owner = occupants[k - p.taken];
                  const isChair = p.type === 'CHAIR';
                  const isSauna = p.type === 'SAUNA';
                  return (
                    <button
                      key={`${p.id}-${k}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(p.id)}
                      aria-pressed={state === 'mine-active'}
                      aria-label={`${p.name}${p.capacity > 1 ? `, ${slotLabel(p, k)}` : ''}`}
                      className={[
                        'relative flex min-h-16 w-[74px] flex-col items-center justify-end rounded-xl border px-1 pb-1.5 pt-5 text-[10px] font-semibold leading-tight transition',
                        isChair ? 'rounded-t-3xl' : '',
                        isSauna ? 'w-[74px]' : '',
                        state === 'mine-active'
                          ? 'border-cocoa-600 bg-cocoa-600 text-white ring-2 ring-gilt-500'
                          : state === 'mine'
                            ? 'border-cocoa-600 bg-cocoa-600 text-white'
                            : state === 'free'
                              ? 'border-sand-300 bg-sand-50 text-cocoa-700 hover:-translate-y-px hover:border-cocoa-400'
                              : state === 'full' || state === 'held'
                                ? 'cursor-not-allowed border-sand-200 bg-sand-100 text-cocoa-300'
                                : 'cursor-not-allowed border-dashed border-sand-300 bg-white text-cocoa-300 opacity-40',
                      ].join(' ')}
                    >
                      <span>{slotLabel(p, k)}</span>
                      {mine && (
                        <span className="mt-0.5 block max-w-full truncate text-[9px] font-bold">
                          {guests[owner ?? activeGuest]?.name || 'You'}
                        </span>
                      )}
                      {(state === 'full' || state === 'held') && p.freeFromIso && (
                        <span className="mt-0.5 block text-[9px] font-normal text-cocoa-400">
                          until {shortTime(p.freeFromIso)}
                        </span>
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-cocoa-500">
        <span className="flex items-center gap-1.5">
          <i className="block h-3 w-4 rounded border border-sand-300 bg-sand-50" /> Free
        </span>
        <span className="flex items-center gap-1.5">
          <i className="block h-3 w-4 rounded border border-sand-200 bg-sand-100" /> Booked
        </span>
        <span className="flex items-center gap-1.5">
          <i className="block h-3 w-4 rounded border border-cocoa-600 bg-cocoa-600" />{' '}
          {party > 1 ? 'Your party' : 'Your choice'}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="block h-3 w-4 rounded border border-dashed border-sand-300 opacity-50" />{' '}
          Not for this treatment
        </span>
      </div>
    </div>
  );
}
