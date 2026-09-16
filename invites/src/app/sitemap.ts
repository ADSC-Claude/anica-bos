import type { MetadataRoute } from 'next';
import { appUrl, invitationPath } from '@/lib/app-url';
import { prisma } from '@/lib/db';
import { templateOccasions } from '@/lib/occasions';
import { getSettings } from '@/lib/settings';

/*
 * Read per request, not once at build. The shop's being closed is a setting
 * in the database and the sitemap answers to it, so a sitemap baked at build
 * time would go on advertising the gallery for as long as the deployment
 * lasted — which is exactly what it did the first time this was tried.
 */
export const dynamic = 'force-dynamic';

/**
 * The marketing pages and every PUBLIC published invitation. Unlisted and
 * password-protected ones stay out.
 *
 * With the shop closed (`site.comingSoon`) the marketing pages come out too,
 * because every one of them redirects: a sitemap that lists a redirect is a
 * sitemap that sends a crawler somewhere it was not promised. The legal
 * pages stay, since a promise made to somebody who already bought does not
 * close, and so do the invitations — those are delivered, not on sale.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const closed = (await getSettings())['site.comingSoon'];
  const marketing = closed ? [] : ['', '/templates', '/occasions'];
  const pages: MetadataRoute.Sitemap = [...marketing, '/terms', '/privacy', '/refund-policy']
    .map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 }));
  try {
    const invitations = await prisma.invitation.findMany({ where: { status: 'PUBLISHED', privacy: 'PUBLIC' }, select: { slug: true, updatedAt: true }, take: 5000 });
    // one page per occasion that has a design, and none at all while the shop is closed
    const designs = closed ? [] : await prisma.template.findMany({ where: { published: true }, select: { occasion: true, occasions: true } });
    const occasionPages = [...new Set(designs.flatMap((t) => templateOccasions(t)))].map((k) => ({ url: `${base}/occasions/${k}`, changeFrequency: 'weekly' as const, priority: 0.6 }));
    return [...pages, ...occasionPages, ...invitations.map((i) => ({ url: `${base}${invitationPath(i.slug)}`, lastModified: i.updatedAt, changeFrequency: 'weekly' as const, priority: 0.4 }))];
  } catch {
    return pages;
  }
}
