import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  availableResources,
  availableTherapists,
  blockersForRuns,
  diagnoseNoSlots,
  floorPlan,
  loadDayFloor,
  placesSatisfying,
  requiredPlaceFor,
  slotsForDay,
  type VisitBlocker,
} from '@/lib/availability';
import { minutesToLabel } from '@/lib/datetime';
import { sweepLapsedBookings } from '@/lib/booking';
import { placeRuns, planVisit, visitMinutes } from '@/lib/itinerary';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/availability?branchId=&date=YYYY-MM-DD&serviceIds=a,b
 *
 * Returns every bookable start time for the day, and — for a specific
 * `startAt` — the therapists and rooms actually free for that window.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  /**
   * A request whose only job is to be first.
   *
   * On Vercel every route is its own function, so the booking page warms up
   * `/api/public/catalog` when it loads and then hits this one cold thirty
   * seconds later, when the guest picks a treatment — a fresh function, a
   * fresh database connection, and her watching a spinner for the whole of it.
   *
   * The page sends this the moment it opens. `SELECT 1` is not the point; the
   * connection it opens is. By the time she has chosen, the expensive part has
   * already happened while she was reading the price list.
   *
   * It returns before the lapsed-booking sweep below, deliberately: warming is
   * not a reason to run housekeeping, and the sweep would make the cheap
   * request expensive.
   */
  if (url.searchParams.get('warm') === '1') {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      // A warm-up that fails has cost the guest nothing — the real request
      // will report the problem properly. Saying so here would be noise.
    }
    return NextResponse.json({ warm: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Tidy up bookings whose window has closed before answering what is free.
  //
  // Availability already ignores a lapsed hold, so the times returned below are
  // right either way — this is what turns those bookings EXPIRED and tells the
  // guest hers did not go through. The nightly job alone would leave her
  // waiting most of a day for that news; the people browsing this page carry it
  // instead, throttled to once a minute per instance.
  await sweepLapsedBookings();

  const dateKey = url.searchParams.get('date') ?? '';
  const serviceIds = (url.searchParams.get('serviceIds') ?? '').split(',').filter(Boolean);
  const startAtParam = url.searchParams.get('startAt');
  // Everyone else in the party, one group of service ids per guest:
  //   guests=svcA,svcB|svcC
  // Their treatments decide which places they need, so a slot is only offered
  // when the whole party fits — otherwise a couple picks 8pm, fills the form,
  // and finds out at the last step that there is one bed and two of them.
  const guestGroups = (url.searchParams.get('guests') ?? '')
    .split('|')
    .map((g) => g.split(',').filter(Boolean))
    .filter((g) => g.length);
  // Deliberate waits the booker has asked for: `svcA:15,svcB:30`. Keyed by
  // service so the wait belongs to the treatment she wants later rather than
  // to a position in a list she can still reorder.
  //
  // Clamped, because this arrives from a browser: a wait longer than the day
  // is not a booking, it is a way to make the planner do arithmetic all night.
  const waits = new Map<string, number>(
    (url.searchParams.get('waits') ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [id, mins] = pair.split(':');
        return [id, Math.min(720, Math.max(0, Math.round(Number(mins) || 0)))] as const;
      })
      .filter(([id, mins]) => id && mins > 0),
  );

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: 'A valid date is required.' }, { status: 400 });
  }
  if (!serviceIds.length) {
    return NextResponse.json({ error: 'Choose a service first.' }, { status: 400 });
  }

  const branch =
    (url.searchParams.get('branchId')
      ? await prisma.branch.findUnique({ where: { id: url.searchParams.get('branchId')! } })
      : null) ??
    (await prisma.branch.findFirst({
      where: { active: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    }));
  if (!branch) return NextResponse.json({ error: 'No branch available.' }, { status: 404 });

  const settings = await getSettings(branch.id);
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, active: true },
    select: {
      id: true,
      durationMinutes: true,
      priceCents: true,
      name: true,
      requiredResourceType: true,
      sequenceRank: true,
      changeoverMinutes: true,
      isAddOn: true,
    },
  });
  if (services.length !== serviceIds.length) {
    return NextResponse.json({ error: 'A selected service is unavailable.' }, { status: 400 });
  }
  // Keep the order the caller sent — the booking form lets the guest reorder
  // her visit, and re-sorting here would silently undo it. Only when nothing
  // has been ordered yet does the house order apply.
  const ordered = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter(Boolean) as typeof services;
  const houseChangeover = settings['booking.changeoverMinutes'];
  const treatments = ordered.map((s, i) => ({
    serviceId: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    changeoverMinutes: s.changeoverMinutes,
    sequenceRank: s.sequenceRank,
    placeType: s.requiredResourceType,
    isAddOn: s.isAddOn,
    // A wait before the first treatment is just a later start time, and an
    // add-on cannot be pushed away from what it extends.
    gapBefore: i === 0 || s.isAddOn ? 0 : (waits.get(s.id) ?? 0),
  }));
  // Door to door, gaps included. A sauna and a massage is 110 minutes, not 90,
  // and quoting 90 is how the desk ends up an hour behind by nine o'clock.
  const durationMinutes = visitMinutes(treatments, houseChangeover);
  const priceCents = services.reduce((a, s) => a + s.priceCents, 0);

  // The guests' treatments too, so the fee quoted is the party's and the slot
  // filter knows what each of them needs.
  const guestCatalog = guestGroups.length
    ? await prisma.service.findMany({
        where: { id: { in: [...new Set(guestGroups.flat())] }, active: true },
        select: {
          id: true, name: true, durationMinutes: true, priceCents: true,
          requiredResourceType: true, sequenceRank: true, changeoverMinutes: true,
          isAddOn: true,
        },
      })
    : [];
  const guestById = new Map(guestCatalog.map((g) => [g.id, g]));
  const guestSeats = guestGroups.map((ids) => {
    const rows = ids.map((id) => guestById.get(id)).filter(Boolean) as typeof guestCatalog;
    return {
      rows,
      minutes: visitMinutes(
        rows.map((r) => ({
          serviceId: r.id,
          name: r.name,
          durationMinutes: r.durationMinutes,
          changeoverMinutes: r.changeoverMinutes,
          sequenceRank: r.sequenceRank,
          placeType: r.requiredResourceType,
          isAddOn: r.isAddOn,
        })),
        houseChangeover,
      ),
      price: rows.reduce((a, r) => a + r.priceCents, 0),
      place: requiredPlaceFor(rows),
    };
  });
  const partySize = 1 + guestSeats.length;
  const partyPriceCents = priceCents + guestSeats.reduce((a, s) => a + s.price, 0);
  // A foot spa needs a chair, a massage needs a bed. Offering the wrong kind of
  // place is what puts a 90-minute massage on a foot-spa chair and a foot spa
  // on a bed that could have been sold.
  const place = requiredPlaceFor(services);

  // --- one specific slot: who and which room is free? ---
  if (startAtParam) {
    const startAt = new Date(startAtParam);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    // Rescheduling an existing booking: its own bed and therapist must not read
    // as taken, or the desk cannot move an appointment without first freeing it.
    // Ignored by the public form, which never sends it.
    const excludeAppointmentId = url.searchParams.get('excludeAppointmentId') ?? undefined;
    const [therapists, resources, plan] = await Promise.all([
      availableTherapists({
        branchId: branch.id, startAt, endAt, serviceIds, excludeAppointmentId,
      }),
      // partySize matters here as much as in the slot loop: without it a
      // couples room is filtered out of the picker for a booking of two, which
      // is the one case it exists for.
      availableResources({
        branchId: branch.id, startAt, endAt, resourceType: place, partySize,
        excludeAppointmentId,
      }),
      // The whole floor, so the picker can draw the taken places too — hiding
      // them just moves "why not that one?" to after the click.
      floorPlan({ branchId: branch.id, startAt, endAt, excludeAppointmentId }),
    ]);
    /**
     * Every treatment in the whole party, each with the floor as it stands
     * during *its own* window.
     *
     * This is what a picker needs and what it was not being given. A guest
     * booking a sauna then a massage needs two places, not one — and the bed
     * she wants at 2:05 may be occupied at 1:30, when she is in the sauna.
     * Drawing one floor for the whole visit marks that bed taken and refuses a
     * booking the spa could have sold.
     *
     * One `floorPlan` per leg is a handful of extra queries on a screen that is
     * already fetching, and it is the difference between offering the right
     * places and offering the wrong ones.
     */
    const partyLegs: {
      guestIndex: number;
      serviceId: string;
      name: string;
      startAt: string;
      endAt: string;
      accepts: string[] | null;
    }[] = [];
    const legWindows: { startAt: Date; endAt: Date }[] = [];

    const collect = (
      guestIndex: number,
      rows: { id: string; durationMinutes: number; requiredResourceType: typeof place;
              sequenceRank: number; changeoverMinutes: number | null; name?: string }[],
      names: Map<string, string>,
    ) => {
      const steps = planVisit({
        treatments: rows.map((r) => ({
          serviceId: r.id,
          name: names.get(r.id) ?? '',
          durationMinutes: r.durationMinutes,
          changeoverMinutes: r.changeoverMinutes,
          sequenceRank: r.sequenceRank,
        })),
        startAt,
        changeoverMinutes: houseChangeover,
      });
      for (const step of steps) {
        const row = rows.find((r) => r.id === step.serviceId)!;
        const needs = requiredPlaceFor([row]);
        partyLegs.push({
          guestIndex,
          serviceId: step.serviceId,
          name: step.name,
          startAt: step.startAt.toISOString(),
          endAt: step.endAt.toISOString(),
          accepts: needs ? placesSatisfying(needs) : null,
        });
        legWindows.push({ startAt: step.startAt, endAt: step.endAt });
      }
    };

    const bookerNames = new Map(ordered.map((x) => [x.id, x.name]));
    collect(0, ordered, bookerNames);
    guestSeats.forEach((seat, i) => {
      collect(i + 1, seat.rows, new Map(seat.rows.map((r) => [r.id, r.name ?? ''])));
    });

    const legPlans = await Promise.all(
      legWindows.map((w) =>
        floorPlan({
          branchId: branch.id, startAt: w.startAt, endAt: w.endAt, excludeAppointmentId,
        }),
      ),
    );
    const legs = partyLegs.map((leg, i) => ({ ...leg, plan: legPlans[i] }));

    // The visit, treatment by treatment: when each runs, how long the gap
    // after it is, and what kind of place it needs. The form draws this as a
    // list you can reorder, so the guest sees the consequence of the order
    // rather than being asked an abstract question about it.
    const itinerary = planVisit({ treatments, startAt, changeoverMinutes: houseChangeover }).map(
      (step) => {
        const svc = ordered.find((x) => x.id === step.serviceId)!;
        const needs = requiredPlaceFor([svc]);
        return {
          serviceId: step.serviceId,
          name: step.name,
          durationMinutes: step.durationMinutes,
          startAt: step.startAt.toISOString(),
          endAt: step.endAt.toISOString(),
          changeoverAfter: step.changeoverAfter,
          accepts: needs ? placesSatisfying(needs) : null,
        };
      },
    );

    return NextResponse.json({
      therapists: therapists.map((t) => ({ id: t.id, name: t.name })),
      resources,
      plan,
      itinerary,
      /** One entry per treatment of every guest, each with its own floor. */
      legs,
      /** Which place types this booking's treatments can actually use. */
      accepts: place ? placesSatisfying(place) : null,
      /**
       * The same, per guest and in the order they were sent, so the picker can
       * dim the beds while a foot-spa guest is selected without re-deriving the
       * rule in the browser.
       */
      guestAccepts: guestSeats.map((seat) =>
        seat.place ? placesSatisfying(seat.place) : null,
      ),
      durationMinutes,
      priceCents: partyPriceCents,
      depositCents: Math.round((partyPriceCents * settings['booking.depositPercent']) / 100),
      partySize,
    });
  }

  // --- the whole day: which start times have any capacity at all? ---
  const candidates = slotsForDay({
    dateKey,
    openMinute: branch.openMinute,
    closeMinute: branch.closeMinute,
    durationMinutes,
    stepMinutes: settings['booking.slotStepMinutes'],
    leadTimeMinutes: settings['booking.leadTimeMinutes'],
    lastCallMinutes: settings['booking.lastCallMinutes'],
  });

  const slots: {
    minute: number; label: string; startAt: string; therapists: number; needsApproval: boolean;
  }[] = [];

  /**
   * The floor for the whole day, loaded once.
   *
   * Every candidate start time asks the same rows the same question. Forty-odd
   * candidates times a treatment each was two queries per candidate; this is
   * two for the day.
   */
  const dayFloor = candidates.length
    ? await loadDayFloor({
        branchId: branch.id,
        from: candidates[0].startAt,
        // The last visit of the day is the one that reaches furthest, and a
        // hold that starts before the window still has to be seen.
        to: new Date(
          candidates[candidates.length - 1].startAt.getTime() +
            Math.max(durationMinutes, ...guestSeats.map((s) => s.minutes), 0) * 60_000,
        ),
      })
    : { resources: [], holds: [] };

  /** Everything the whole party needs a place for, laid out from one start. */
  const runsFrom = (startAt: Date) => {
    const seats = [
      { treatments, label: 'you' },
      ...guestSeats.map((seat, i) => ({
        treatments: seat.rows.map((r) => ({
          serviceId: r.id,
          name: r.name,
          durationMinutes: r.durationMinutes,
          changeoverMinutes: r.changeoverMinutes,
          sequenceRank: r.sequenceRank,
          placeType: r.requiredResourceType,
          isAddOn: r.isAddOn,
        })),
        label: `guest ${i + 2}`,
      })),
    ];
    return seats.flatMap((seat) =>
      placeRuns(
        planVisit({
          treatments: seat.treatments,
          startAt,
          changeoverMinutes: houseChangeover,
        }),
      ).map((run) => ({
        placeType: run.placeType,
        startAt: run.startAt,
        endAt: run.endAt,
        // Name the treatment, not the run: "the sauna is taken" means nothing
        // to someone who picked "Sauna Session (30 min)" off a list.
        label: run.segments.map((s) => s.name).join(' and '),
      })),
    );
  };

  /** Why a start time was refused, kept so an empty day can explain itself. */
  const refusals: VisitBlocker[] = [];

  for (const c of candidates) {
    const endAt = new Date(c.startAt.getTime() + durationMinutes * 60_000);
    const therapists = await availableTherapists({
      branchId: branch.id, startAt: c.startAt, endAt, serviceIds,
    });
    if (!therapists.length) continue;
    // A party needs a therapist each, not one between them.
    if (partySize > 1 && therapists.length < partySize) continue;

    // Every treatment against the place *it* needs, in the window it actually
    // runs. Asking once for "a bed for the whole visit" both offered times the
    // sauna could not honour and hid times that would have sold.
    const blockers = blockersForRuns(dayFloor, runsFrom(c.startAt), { partySize });
    if (blockers.length) {
      refusals.push(...blockers);
      continue;
    }

    slots.push({
      minute: c.minute,
      label: minutesToLabel(c.minute),
      startAt: c.startAt.toISOString(),
      therapists: therapists.length,
      needsApproval: c.needsApproval,
    });
  }

  // An empty list needs a reason. When every date comes back empty the cause is
  // never the date, and "try another day" sends the guest round in circles.
  const reason = slots.length
    ? null
    : await diagnoseNoSlots({
        branchId: branch.id,
        serviceIds,
        serviceNames: services.map((s) => s.name),
        place,
        candidates,
        partySize,
      });

  /**
   * Which treatment kept getting in the way, and when its place comes back.
   *
   * A guest booking a sauna and a massage on a day the sauna is spoken for
   * until half past two should be told exactly that, once, rather than left to
   * try every greyed-out time on the list. One line per treatment, holding the
   * earliest moment its place was ever free, because that is the first time
   * worth trying.
   */
  const blocked = [...
    refusals
      .reduce((map, b) => {
        const seen = map.get(b.treatment);
        // The earliest release is the useful one: it is the soonest this
        // treatment could possibly go ahead.
        if (!seen || (b.freeAt && seen.freeAt && b.freeAt < seen.freeAt) || (b.freeAt && !seen.freeAt)) {
          map.set(b.treatment, b);
        }
        return map;
      }, new Map<string, VisitBlocker>())
      .values(),
  ].map((b) => ({
    treatment: b.treatment,
    placeType: b.placeType,
    freeAt: b.freeAt ? b.freeAt.toISOString() : null,
  }));

  return NextResponse.json({
    branchId: branch.id,
    durationMinutes,
    priceCents: partyPriceCents,
    depositCents: Math.round((partyPriceCents * settings['booking.depositPercent']) / 100),
    partySize,
    slots,
    reason,
    /** Only worth showing when the day came back thin or empty. */
    blocked,
  });
}
