import type { Occasion } from '@prisma/client';
import { prisma } from './db';
import { getSettings } from './settings';

/**
 * Whose invitation a design is drawn on when there is a design to look at
 * but nobody to look at it with.
 *
 * A design renders *an invitation*: names, dates, a venue, a list of
 * sponsors. The studio has always had the design's own demo for this, and a
 * design that has one is easy. The preview panel beside the template form
 * has to cope with the case the studio never met — a design made five
 * minutes ago, with no demo, no pages and no customers — because that is
 * exactly when somebody is choosing its colours.
 *
 * So, in order:
 *
 *   1. **its own demo**, which is the invitation the design was drawn to;
 *   2. **the newest published invitation of the same occasion**, so a
 *      christening design gets christening sections in front of it rather
 *      than a wedding's entourage;
 *   3. **the site's demo**, which is a wedding and is the last resort.
 *
 * The page renders the sitter as itself — its own occasion, its own
 * sections — rather than forcing the design's occasion onto somebody else's
 * content, which would produce a half-empty page that looks broken and says
 * nothing about the colours. Whoever is sitting is named on the panel, so a
 * design for a christening shown on a wedding is never a mystery.
 */
export type Sitter = { slug: string; title: string; occasion: Occasion; own: boolean };

export async function previewSitter(demoSlug: string, occasion: Occasion): Promise<Sitter | null> {
  const pick = { slug: true, title: true, occasion: true } as const;

  if (demoSlug) {
    const own = await prisma.invitation.findUnique({ where: { slug: demoSlug }, select: pick });
    if (own) return { ...own, own: true };
  }

  const near = await prisma.invitation.findFirst({
    where: { occasion, status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    select: pick,
  });
  if (near) return { ...near, own: false };

  const s = await getSettings();
  const site = s['site.demoSlug']
    ? await prisma.invitation.findUnique({ where: { slug: s['site.demoSlug'] }, select: pick })
    : null;
  return site ? { ...site, own: false } : null;
}
