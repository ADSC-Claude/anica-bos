import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { availableResources, availableTherapists, slotsForDay } from '@/lib/availability';
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
    select: { id: true, durationMinutes: true, priceCents: true, name: true },
  });
  if (services.length !== serviceIds.length) {
    return NextResponse.json({ error: 'A selected service is unavailable.' }, { status: 400 });
  }
  const durationMinutes = services.reduce((a, s) => a + s.durationMinutes, 0);
  const priceCents = services.reduce((a, s) => a + s.priceCents, 0);

  // --- one specific slot: who and which room is free? ---
  if (startAtParam) {
    const startAt = new Date(startAtParam);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const [therapists, resources] = await Promise.all([
      availableTherapists({ branchId: branch.id, startAt, endAt, serviceIds }),
      availableResources({ branchId: branch.id, startAt, endAt }),
    ]);
    return NextResponse.json({
      therapists: therapists.map((t) => ({ id: t.id, name: t.name })),
      resources,
      durationMinutes,
      priceCents,
      depositCents: Math.round((priceCents * settings['booking.depositPercent']) / 100),
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
  });

  const slots: { minute: number; label: string; startAt: string; therapists: number }[] = [];
  for (const c of candidates) {
    const endAt = new Date(c.startAt.getTime() + durationMinutes * 60_000);
    const [therapists, resources] = await Promise.all([
      availableTherapists({ branchId: branch.id, startAt: c.startAt, endAt, serviceIds }),
      availableResources({ branchId: branch.id, startAt: c.startAt, endAt }),
    ]);
    if (!therapists.length || !resources.length) continue;
    slots.push({
      minute: c.minute,
      label: minutesToLabel(c.minute),
      startAt: c.startAt.toISOString(),
      therapists: therapists.length,
    });
  }

  return NextResponse.json({
    branchId: branch.id,
    durationMinutes,
    priceCents,
    depositCents: Math.round((priceCents * settings['booking.depositPercent']) / 100),
    slots,
  });
}
