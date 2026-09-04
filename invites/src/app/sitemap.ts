import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';
import { prisma } from '@/lib/db';

/** The marketing pages and every PUBLIC published invitation. Unlisted and password-protected ones stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const pages: MetadataRoute.Sitemap = ['', '/templates', '/terms', '/privacy', '/refund-policy'].map((p) => ({ url: `${base}${p}`, changeFrequency: 'weekly', priority: p === '' ? 1 : 0.6 }));
  try {
    const invitations = await prisma.invitation.findMany({ where: { status: 'PUBLISHED', privacy: 'PUBLIC' }, select: { slug: true, updatedAt: true }, take: 5000 });
    return [...pages, ...invitations.map((i) => ({ url: `${base}/i/${i.slug}`, lastModified: i.updatedAt, changeFrequency: 'weekly' as const, priority: 0.4 }))];
  } catch {
    return pages;
  }
}
