import 'server-only';
import type { Template } from '@prisma/client';
import { prisma } from './db';
import { toGalleryTemplate, type GalleryTemplate } from './gallery';

/**
 * The peek: a visitor scrolls a design's demo from the opening to Our Story
 * before choosing it, and the page stops there with the design's name and
 * the way in. The demo is the invitation the design names (Template.demoSlug);
 * it is offered only where that invitation exists and is on this design, so
 * a demo moved to another design, or not yet made, offers nothing rather than
 * a page that does not match.
 */
export async function peekSlugs(templates: Pick<Template, 'id' | 'demoSlug'>[]): Promise<Record<string, string>> {
  const wanted = templates.filter((t) => t.demoSlug);
  if (!wanted.length) return {};
  const demos = await prisma.invitation.findMany({ where: { slug: { in: wanted.map((t) => t.demoSlug) }, status: { not: 'ARCHIVED' } }, select: { slug: true, templateId: true } });
  const out: Record<string, string> = {};
  for (const t of wanted) if (demos.some((d) => d.slug === t.demoSlug && d.templateId === t.id)) out[t.id] = t.demoSlug;
  return out;
}

/** The gallery's rows, each with its peek where one is offered. */
export async function galleryWithPeeks(templates: Template[]): Promise<GalleryTemplate[]> {
  const peeks = await peekSlugs(templates);
  return templates.map((t) => ({ ...toGalleryTemplate(t), peekSlug: peeks[t.id] ?? '' }));
}
