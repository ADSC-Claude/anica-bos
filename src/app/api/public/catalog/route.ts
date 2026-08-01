import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Everything the public booking form needs to render itself. */
export async function GET() {
  const settings = await getSettings();

  const [branches, categories, fields, places] = await Promise.all([
    prisma.branch.findMany({
      where: { active: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, address: true, openMinute: true, closeMinute: true },
    }),
    prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: [{ sortRank: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        services: {
          where: { active: true },
          orderBy: [{ sortRank: 'asc' }, { name: 'asc' }],
          select: {
            id: true, name: true, durationMinutes: true, priceCents: true,
            // The visit planner needs all three: where a treatment usually
            // falls in a visit, how much floor time it needs after itself, and
            // whether it is an extra that runs on with no gap at all.
            sequenceRank: true, changeoverMinutes: true, isAddOn: true,
          },
        },
      },
    }),
    prisma.clientFieldDefinition.findMany({
      where: { retired: false, showOnline: true },
      orderBy: { sortRank: 'asc' },
      select: {
        key: true,
        label: true,
        section: true,
        type: true,
        options: true,
        helpText: true,
        required: true,
      },
    }),
    // How many people the spa can physically hold at once, so the party-size
    // choices follow the floor instead of a number typed here. Eight beds and
    // two chairs is ten; adding a bed makes it eleven without anyone editing
    // this file.
    prisma.resource.groupBy({
      by: ['branchId'],
      where: { active: true, type: { not: 'SAUNA' } },
      _sum: { capacity: true },
    }),
  ]);

  // The sauna is left out: it seats four, but a party is unlikely to book it as
  // their treatment, and counting it would offer a party size the beds cannot
  // serve. Therapist availability trims this further at the slot stage — a
  // party of eight simply finds no free times when six therapists are on.
  const seats = Math.max(
    1,
    places.reduce((a, p) => a + (p._sum.capacity ?? 0), 0),
  );

  return NextResponse.json({
    branches,
    categories: categories.filter((c) => c.services.length),
    fields,
    depositPercent: settings['booking.depositPercent'],
    /** House gap between two treatments in one visit, so the form can quote it. */
    changeoverMinutes: settings['booking.changeoverMinutes'],
    expiryMinutes: settings['booking.expiryMinutes'],
    manualFallback: settings['booking.manualFallbackEnabled'],
    leadTimeMinutes: settings['booking.leadTimeMinutes'],
    slotStepMinutes: settings['booking.slotStepMinutes'],
    gcash: {
      name: settings['booking.gcashName'],
      number: settings['booking.gcashNumber'],
      bank: settings['booking.bankDetails'],
    },
    bookingEnabled: settings['booking.enabled'],
    /** The largest party the floor could hold. Offered as choices, not promised. */
    maxParty: Math.min(seats, 12),
  });
}
