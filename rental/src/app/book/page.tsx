import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { requirePublicSite } from '@/lib/public-site';
import { addDays, manilaDateKey } from '@/lib/datetime';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { BookingWizard } from './wizard';

export const metadata = { title: 'Book your stay' };
export const dynamic = 'force-dynamic';

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; adults?: string; property?: string }>;
}) {
  await requirePublicSite();
  const params = await searchParams;
  const settings = await getSettings();
  const today = manilaDateKey();

  const addOns = await prisma.addOn.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, description: true, priceCents: true, per: true, propertyId: true, maxQuantity: true },
  });

  return (
    <>
      <SiteHeader settings={settings} />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <BookingWizard
          today={today}
          initial={{
            checkIn: params.checkIn ?? addDays(today, 7),
            checkOut: params.checkOut ?? addDays(today, 10),
            adults: Number(params.adults ?? 2),
            propertyId: params.property ?? null,
          }}
          addOns={addOns}
          depositPercent={settings['booking.depositPercent']}
          cancellationPolicy={settings['booking.cancellationPolicy']}
          privacyNote={settings['booking.termsNote']}
          holdMinutes={settings['booking.holdMinutes']}
        />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
