import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Everything the public booking form needs to render itself. */
export async function GET() {
  const settings = await getSettings();

  const [branches, categories, fields] = await Promise.all([
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
          select: { id: true, name: true, durationMinutes: true, priceCents: true },
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
  ]);

  return NextResponse.json({
    branches,
    categories: categories.filter((c) => c.services.length),
    fields,
    depositPercent: settings['booking.depositPercent'],
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
  });
}
