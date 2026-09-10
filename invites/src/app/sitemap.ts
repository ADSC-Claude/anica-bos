import type { MetadataRoute } from 'next';
import { appUrl, invitationPath } from '@/lib/app-url';
import { prisma } from '@/lib/db';
import { templateOccasions } from '@/lib/occasions';

/** The marketing pages and every PUBLIC published invitation. Unlisted and password-protected ones stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const pages: MetadataRoute.Sitemap = ['', '/templates', '/occasions', '/terms', '/privacy', '/refund-policy'].map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 }));
  try {
    const invitations = await prisma.invitation.findMany({ where: { status: 'PUBLISHED', privacy: 'PUBLIC' }, select: { slug: true, updatedAt: true }, take: 5000 });
    // one page per occasion that has a design
    const designs = await prisma.template.findMany({ where: { published: true }, select: { occasion: true, occasions: true } });
    const occasionPages = [...new Set(designs.flatMap((t) => templateOccasions(t)))].map((k) => ({ url: `${base}/occasions/${k}`, changeFrequency: 'weekly' as const, priority: 0.6 }));
    return [...pages, ...occasionPages, ...invitations.map((i) => ({ url: `${base}${invitationPath(i.slug)}`, lastModified: i.updatedAt, changeFrequency: 'weekly' as const, priority: 0.4 }))];
  } catch {
    return pages;
  }
}
