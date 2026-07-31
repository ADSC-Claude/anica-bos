/**
 * Guest quotes on the public page.
 *
 * Two rules, and both exist because the landing page is read by strangers
 * rather than by the spa:
 *
 *   1. Nothing is published until someone ticks the box. A five-star rating is
 *      a compliment paid to a receptionist, not permission to reproduce it
 *      under the guest's name on a website.
 *   2. The surname stays behind. The first name carries all the warmth a
 *      testimonial needs; the rest only adds exposure.
 */
import type { PrismaClient } from '@prisma/client';

export type PublishableFeedback = {
  id: string;
  rating: number;
  comment: string;
  client: { name: string };
};

/**
 * "Maria Santos" → "Maria S."
 *
 * Middle names are dropped rather than initialised — "Maria C. S." reads like a
 * legal document, not like a person who enjoyed their massage.
 */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A guest';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * The quotes cleared for the landing page, newest first.
 *
 * `comment: { not: '' }` is deliberate alongside the consent flag: a released
 * rating with no words is a number, and three empty cards under "What guests
 * say" reads worse than no section at all.
 */
export async function publishableFeedback(
  prisma: PrismaClient,
  take = 3,
): Promise<PublishableFeedback[]> {
  return prisma.clientFeedback.findMany({
    where: { showOnLanding: true, comment: { not: '' } },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, rating: true, comment: true, client: { select: { name: true } } },
  });
}
