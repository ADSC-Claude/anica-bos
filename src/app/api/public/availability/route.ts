import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import {
  availableResources,
  availableTherapists,
  diagnoseNoSlots,
  floorPlan,
  placesSatisfying,
  requiredPlaceFor,
  slotsForDay,
} from '@/lib/availability';
import { minutesToLabel } from '@/lib/datetime';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/availability?branchId=&date=YYYY-MM-DD&serviceIds=a,b
 *
 * Returns every bookable start time for the day, and — for a specific
 * `startAt` — the therapists and rooms actually free for that window.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
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
    },
  });
  if (services.length !== serviceIds.length) {
    return NextResponse.json({ error: 'A selected service is unavailable.' }, { status: 400 });
  }
  const durationMinutes = services.reduce((a, s) => a + s.durationMinutes, 0);
  const priceCents = services.reduce((a, s) => a + s.priceCents, 0);

  // The guests' treatments too, so the fee quoted is the party's and the slot
  // filter knows what each of them needs.
  const guestCatalog = guestGroups.length
    ? await prisma.service.findMany({
        where: { id: { in: [...new Set(guestGroups.flat())] }, active: true },
        select: { id: true, durationMinutes: true, priceCents: true, requiredResourceType: true },
      })
    : [];
  const guestById = new Map(guestCatalog.map((g) => [g.id, g]));
  const guestSeats = guestGroups.map((ids) => {
    const rows = ids.map((id) => guestById.get(id)).filter(Boolean) as typeof guestCatalog;
    return {
      minutes: rows.reduce((a, r) => a + r.durationMinutes, 0),
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
    const [therapists, resources, plan] = await Promise.all([
      availableTherapists({ branchId: branch.id, startAt, endAt, serviceIds }),
      // partySize matters here as much as in the slot loop: without it a
      // couples room is filtered out of the picker for a booking of two, which
      // is the one case it exists for.
      availableResources({ branchId: branch.id, startAt, endAt, resourceType: place, partySize }),
      // The whole floor, so the picker can draw the taken places too — hiding
      // them just moves "why not that one?" to after the click.
      floorPlan({ branchId: branch.id, startAt, endAt }),
    ]);
    return NextResponse.json({
      therapists: therapists.map((t) => ({ id: t.id, name: t.name })),
      resources,
      plan,
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
  for (const c of candidates) {
    const endAt = new Date(c.startAt.getTime() + durationMinutes * 60_000);
    const [therapists, resources] = await Promise.all([
      availableTherapists({ branchId: branch.id, startAt: c.startAt, endAt, serviceIds }),
      availableResources({
        branchId: branch.id, startAt: c.startAt, endAt, resourceType: place, partySize,
      }),
    ]);
    if (!therapists.length || !resources.length) continue;

    // A party needs a therapist and a place each. Checking only the booker's
    // would offer a slot with one free bed to a couple, and the disappointment
    // would land after they had filled in the whole form.
    if (partySize > 1) {
      if (therapists.length < partySize) continue;
      const enough = await Promise.all(
        guestSeats.map((seat) =>
          availableResources({
            branchId: branch.id,
            startAt: c.startAt,
            endAt: new Date(c.startAt.getTime() + seat.minutes * 60_000),
            resourceType: seat.place,
            partySize,
          }),
        ),
      );
      if (enough.some((free) => !free.length)) continue;
      // Places, not rows: the booker plus two guests all wanting a bed need
      // three beds, and one couples room with two places is not three.
      const bedLike = [resources, ...enough].filter((_, i) =>
        i === 0 ? true : guestSeats[i - 1].place !== 'CHAIR' && guestSeats[i - 1].place !== 'SAUNA',
      );
      if (bedLike.length > 1) {
        const roomFor = resources.reduce((a, r) => a + r.remaining, 0);
        if (roomFor < bedLike.length) continue;
      }
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

  return NextResponse.json({
    branchId: branch.id,
    durationMinutes,
    priceCents: partyPriceCents,
    depositCents: Math.round((partyPriceCents * settings['booking.depositPercent']) / 100),
    partySize,
    slots,
    reason,
  });
}
