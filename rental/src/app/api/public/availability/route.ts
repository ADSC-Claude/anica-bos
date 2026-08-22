import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, HttpError } from '@/lib/guard';
import { availablePropertyIds } from '@/lib/calendar';
import { fromPrice } from '@/lib/pricing';
import { nightsBetween, toStayDate } from '@/lib/datetime';

const query = z.object({
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guests: z.coerce.number().int().min(1).max(30).default(1),
  branch: z.string().optional(),
});

/**
 * Public availability. Computed from the calendar on every request — there is
 * no cache and no nightly export, so there is no window in which the site
 * offers a night Airbnb already sold.
 *
 * Unavailable properties are returned too, with a reason. A guest who sees
 * "sleeps 2" against their party of four understands the site; a guest who
 * sees an empty page assumes it is broken.
 */
export const GET = handle(async (req) => {
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new HttpError(400, 'Please give a check-in date, a check-out date and a guest count.');
  const { checkIn, checkOut, guests, branch } = parsed.data;

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new HttpError(400, 'Check-out must be after check-in.');

  const properties = await prisma.property.findMany({
    where: { status: 'ACTIVE', ...(branch ? { branchId: branch } : {}) },
    include: {
      photos: { orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      branch: { select: { name: true, city: true } },
    },
    orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
  });

  const free = await availablePropertyIds(
    toStayDate(checkIn),
    toStayDate(checkOut),
    properties.map((p) => p.id),
  );

  const results = await Promise.all(
    properties.map(async (p) => {
      const reasons: string[] = [];
      if (!free.has(p.id)) reasons.push('Not available on those dates');
      if (guests > p.maxGuests) reasons.push(`Sleeps ${p.maxGuests}`);
      if (nights < p.minNights) reasons.push(`${p.minNights}-night minimum`);
      if (p.maxNights > 0 && nights > p.maxNights) reasons.push(`${p.maxNights}-night maximum`);

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        type: p.type,
        city: p.city || p.branch.city,
        branch: p.branch.name,
        maxGuests: p.maxGuests,
        bedrooms: p.bedrooms,
        beds: p.beds,
        bathrooms: p.bathrooms,
        shortDescription: p.shortDescription,
        photo: p.photos[0]?.url ?? null,
        fromPriceCents: await fromPrice(p.id),
        available: reasons.length === 0,
        reason: reasons[0] ?? null,
      };
    }),
  );

  return { nights, results };
});
