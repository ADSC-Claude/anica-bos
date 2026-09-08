import 'server-only';
import type { Template } from '@prisma/client';
import { prisma } from './db';
import { toGalleryTemplate, type GalleryTemplate } from './gallery';
import { contentOf } from './invitations';
import { LOOK_BY_KEY, isLook } from './looks';
import { premiumOpeningsFor } from './premium-openings';
import { withWords, wordsOf } from './design';
import { plateWords, type PlateWords } from '@/components/invite/renderer';

/**
 * The peek: a visitor scrolls a design's demo from the opening to Our Story
 * before choosing it, and the page stops there with the design's name and
 * the way in. The demo is the invitation the design names (Template.demoSlug);
 * it is offered only where that invitation exists and is on this design, so
 * a demo moved to another design, or not yet made, offers nothing rather than
 * a page that does not match.
 */
export async function peekSlugs(templates: Pick<Template, 'id' | 'demoSlug'>[]): Promise<Record<string, string>> {
  const demos = await demosOf(templates);
  return Object.fromEntries(Object.entries(demos).map(([id, d]) => [id, d.slug]));
}

type Demo = { slug: string; templateId: string; occasion: Template['occasion']; language: string; content: unknown };

/** Each design's demo invitation, where it exists and is on that design. */
async function demosOf(templates: Pick<Template, 'id' | 'demoSlug'>[]): Promise<Record<string, Demo>> {
  const wanted = templates.filter((t) => t.demoSlug);
  if (!wanted.length) return {};
  const demos = await prisma.invitation.findMany({ where: { slug: { in: wanted.map((t) => t.demoSlug) }, status: { not: 'ARCHIVED' } }, select: { slug: true, templateId: true, occasion: true, language: true, content: true } });
  const out: Record<string, Demo> = {};
  for (const t of wanted) {
    const d = demos.find((x) => x.slug === t.demoSlug && x.templateId === t.id);
    if (d) out[t.id] = d;
  }
  return out;
}

/**
 * The words the demo's form sets on the design's premium card — the same
 * function the guest page uses, so the preview's sample is the demo as a
 * guest would get it: rename the child in the form and the preview follows.
 */
function sampleOf(t: Template, demo: Demo): PlateWords {
  // the look with the design's own words over it, as the guest page builds it — a
  // christening's "The christening of" rather than the wedding line the look was born with
  const look = t.look && isLook(t.look) ? withWords(LOOK_BY_KEY[t.look], wordsOf(t.words)) : undefined;
  const premium = premiumOpeningsFor({ slug: t.slug, collection: t.collection })[0] ?? null;
  return plateWords(demo.occasion, contentOf(demo.content), demo.language === 'tl' ? 'tl' : 'en', look, premium);
}

/** The gallery's rows, each with its peek and its sample words where a demo exists. */
export async function galleryWithPeeks(templates: Template[]): Promise<GalleryTemplate[]> {
  const demos = await demosOf(templates);
  return templates.map((t) => {
    const d = demos[t.id];
    return { ...toGalleryTemplate(t), peekSlug: d?.slug ?? '', sample: d ? sampleOf(t, d) : null };
  });
}
