import 'server-only';
import type { Occasion, Tier, Privacy } from '@prisma/client';
import { prisma, isUniqueError } from './db';
import { HttpError } from './errors';
import { slugify, randomCode } from './codes';
import { hashPassword, verifyPassword, type SessionUser } from './auth';
import {
  cleanSection,
  defaultContent,
  displayTitle,
  eventInstant,
  fieldsFor,
  publishProblems,
  rsvpDeadline,
  sectionUnlocked,
  coverImage,
  type Content,
  type SectionKey,
  OCCASION_SECTIONS,
} from './sections';
import { hasFeature } from './tiers';
import { addDays, manilaDateKey } from './datetime';
import { audit } from './audit';
import type { Lang } from './copy';
import { PALETTE_PRESETS, FONT_PRESETS, paletteFrom, fontsFrom, type Palette, type Fonts } from './theme';
import { invitationPath } from './app-url';

/**
 * The invitation's lifecycle: a draft is created at checkout, unlocked when
 * the order activates, edited section by section, published to a slug, and
 * expires after the event. Content is JSON shaped by sections.ts; this module
 * is the only writer of it.
 */

export type ThemeOverride = { paletteKey?: string; palette?: Partial<Palette>; fontsKey?: string };
export type StoredContent = Content & { theme?: ThemeOverride };

/**
 * Slugs live at the site root, so this list is not a nicety: a slug equal to a
 * top-level route is shadowed by that route and the invitation becomes
 * unreachable — a couple called "Terms" would lose their page to the terms
 * page. Every directory in src/app belongs here, plus the files that serve a
 * path of their own, plus the old /i/ prefix that now only redirects.
 *
 * tests/reserved-slugs.test.ts reads src/app and fails if a route is missing
 * from this list. Adding a page and forgetting this line is the whole failure
 * mode, and it would show up as one customer's invitation quietly 404ing.
 */
export const RESERVED_SLUGS = new Set([
  // Directories under src/app.
  'account', 'admin', 'api', 'checkout', 'coming-soon', 'demo', 'login', 'logout',
  'privacy', 'refund-policy', 'signup', 'templates', 'terms',
  // Files under src/app that serve their own path.
  'robots.txt', 'sitemap.xml', 'favicon.ico',
  // The old guest prefix, which now redirects to the root.
  'i',
  // Never route these, whatever src/app happens to hold today.
  'pricing', 'g', 'new', 'edit', 'preview', 'print', 'card', '_next', 'static',
]);

export function contentOf(raw: unknown): StoredContent {
  return (raw && typeof raw === 'object' ? raw : {}) as StoredContent;
}

export async function slugAvailable(slug: string, exceptId?: string): Promise<boolean> {
  if (!slug || RESERVED_SLUGS.has(slug)) return false;
  const existing = await prisma.invitation.findUnique({ where: { slug }, select: { id: true } });
  return !existing || existing.id === exceptId;
}

/** "juan-and-maria", then "juan-and-maria-2", … then a random suffix. */
export async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || `invite-${randomCode(4).toLowerCase()}`;
  if (await slugAvailable(root, exceptId)) return root;
  for (let i = 2; i < 20; i++) {
    const candidate = `${root}-${i}`;
    if (await slugAvailable(candidate, exceptId)) return candidate;
  }
  return `${root}-${randomCode(4).toLowerCase()}`;
}

export async function createDraft(args: {
  userId: string;
  occasion: Occasion;
  tier: Tier;
  templateId: string;
  language?: Lang;
  title?: string;
}) {
  const template = await prisma.template.findUnique({ where: { id: args.templateId } });
  if (!template || !template.published) throw new HttpError(400, 'That template is not available.');
  if (template.occasion !== args.occasion) throw new HttpError(400, 'That template is for a different occasion.');

  const language = args.language ?? 'en';
  const content = defaultContent(args.occasion, language);
  const title = args.title?.trim() || displayTitle(args.occasion, content);
  const slug = await uniqueSlug(title === displayTitle(args.occasion, defaultContent(args.occasion)) ? `${args.occasion.toLowerCase()}-${randomCode(4).toLowerCase()}` : title);

  return prisma.invitation.create({
    data: {
      userId: args.userId,
      templateId: template.id,
      occasion: args.occasion,
      tier: args.tier,
      title,
      slug,
      content: content as never,
      language,
    },
  });
}

/** Whether the order behind this invitation has been paid. Drafts are read-only until then. */
export function unlocked(invitation: { order: { status: string } | null }): boolean {
  return invitation.order?.status === 'ACTIVE' || invitation.order?.status === 'PAID' || invitation.order === null;
}

export async function saveSection(user: SessionUser, invitationId: string, key: SectionKey, raw: unknown) {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId }, include: { order: { select: { status: true } } } });
  if (!invitation) throw new HttpError(404, 'That invitation does not exist.');
  if (!OCCASION_SECTIONS[invitation.occasion].includes(key)) throw new HttpError(400, 'That section does not belong to this occasion.');
  if (!sectionUnlocked(key, invitation.occasion, invitation.tier)) {
    throw new HttpError(403, 'That section is not included in your package. Upgrade to unlock it.');
  }
  if (!unlocked(invitation)) throw new HttpError(402, 'Your order is not paid yet. The builder unlocks once payment is confirmed.');

  const { data, issues } = cleanSection(fieldsFor(key, invitation.occasion), raw);
  const content = contentOf(invitation.content);
  content[key] = data;

  const eventAt = eventInstant(content);
  const deadline = rsvpDeadline(content);
  const title = displayTitle(invitation.occasion, content);

  // Edits after publish are counted on the Basic tier.
  const published = invitation.status === 'PUBLISHED';
  const editsLeft = invitation.editsAllowed < 0 ? Infinity : invitation.editsAllowed - invitation.editsUsed;
  if (published && editsLeft <= 0) {
    throw new HttpError(403, 'You have used all the edits included in your package. Upgrade for unlimited edits.');
  }

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      content: content as never,
      title,
      eventAt: eventAt ?? undefined,
      rsvpDeadline: deadline ?? undefined,
      ogImageUrl: coverImage(content),
      ...(published ? { editsUsed: { increment: 1 } } : {}),
    },
  });
  return { invitation: updated, issues };
}

export async function updateTheme(user: SessionUser, invitationId: string, theme: ThemeOverride) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  const clean: ThemeOverride = {};
  if (theme.paletteKey && PALETTE_PRESETS.some((p) => p.key === theme.paletteKey)) {
    if (!hasFeature(invitation.tier, 'palette.presets')) throw new HttpError(403, 'Palette presets are included from the Standard tier.');
    clean.paletteKey = theme.paletteKey;
  }
  if (theme.palette) {
    if (!hasFeature(invitation.tier, 'palette.custom')) throw new HttpError(403, 'Custom colours are included in the Complete tier.');
    clean.palette = paletteFrom({ ...PALETTE_PRESETS[0].palette, ...theme.palette });
  }
  if (theme.fontsKey && FONT_PRESETS.some((f) => f.key === theme.fontsKey)) {
    if (!hasFeature(invitation.tier, 'palette.custom')) throw new HttpError(403, 'Font choice is included in the Complete tier.');
    clean.fontsKey = theme.fontsKey;
  }
  const content = contentOf(invitation.content);
  content.theme = { ...(content.theme ?? {}), ...clean };
  return prisma.invitation.update({ where: { id: invitationId }, data: { content: content as never } });
}

/** The palette and fonts a page renders with: the template's, overridden by the customer's. */
export function resolveTheme(template: { palette: unknown; fonts: unknown }, content: StoredContent): { palette: Palette; fonts: Fonts } {
  let palette = paletteFrom(template.palette);
  let fonts = fontsFrom(template.fonts);
  const t = content.theme;
  if (t?.paletteKey) {
    const preset = PALETTE_PRESETS.find((p) => p.key === t.paletteKey);
    if (preset) palette = preset.palette;
  }
  if (t?.palette) palette = paletteFrom({ ...palette, ...t.palette });
  if (t?.fontsKey) {
    const preset = FONT_PRESETS.find((f) => f.key === t.fontsKey);
    if (preset) fonts = preset.fonts;
  }
  return { palette, fonts };
}

export async function updateSettings(
  user: SessionUser,
  invitationId: string,
  input: { slug?: string; privacy?: Privacy; password?: string; language?: Lang; title?: string },
) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  const data: Record<string, unknown> = {};

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (slug !== invitation.slug) {
      if (!hasFeature(invitation.tier, 'slug.custom')) throw new HttpError(403, 'A custom link is included from the Standard tier.');
      if (slug.length < 3) throw new HttpError(400, 'Links need at least 3 characters.');
      if (!(await slugAvailable(slug, invitationId))) throw new HttpError(409, 'That link is already taken. Try another.');
      data.slug = slug;
    }
  }
  if (input.privacy !== undefined) {
    if (input.privacy === 'PASSWORD' && !hasFeature(invitation.tier, 'privacy.password')) {
      throw new HttpError(403, 'Password protection is included in the Complete tier.');
    }
    data.privacy = input.privacy;
    if (input.privacy === 'PASSWORD') {
      const pw = (input.password ?? '').trim();
      if (!pw && !invitation.passwordHash) throw new HttpError(400, 'Set a password for guests.');
      if (pw) data.passwordHash = await hashPassword(pw);
    } else {
      data.passwordHash = null;
    }
  }
  if (input.language !== undefined) data.language = input.language === 'tl' ? 'tl' : 'en';
  if (input.title !== undefined && input.title.trim()) data.title = input.title.trim().slice(0, 120);

  try {
    return await prisma.invitation.update({ where: { id: invitationId }, data });
  } catch (err) {
    if (isUniqueError(err)) throw new HttpError(409, 'That link is already taken. Try another.');
    throw err;
  }
}

export async function changeTemplate(user: SessionUser, invitationId: string, templateId: string) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || !template.published || template.occasion !== invitation.occasion) throw new HttpError(400, 'That template is not available for this invitation.');
  if (template.premium && !hasFeature(invitation.tier, 'templates.premium')) throw new HttpError(403, 'Premium designs are included in the Complete tier.');
  if (!hasFeature(invitation.tier, 'templates.any') && template.minTier !== 'BASIC') throw new HttpError(403, 'The Basic tier includes designs from the Basic set. Upgrade to choose any template.');
  await prisma.invitation.update({ where: { id: invitationId }, data: { templateId } });
  await audit(user, { module: 'invitations', action: 'template.change', entityType: 'Invitation', entityId: invitationId, summary: `Switched to ${template.name}` });
}

export async function publish(user: SessionUser, invitationId: string) {
  const invitation = await prisma.invitation.findUniqueOrThrow({
    where: { id: invitationId },
    include: { order: { include: { package: true } } },
  });
  if (!unlocked(invitation)) throw new HttpError(402, 'Your order is not paid yet.');
  const content = contentOf(invitation.content);
  const problems = publishProblems(invitation.occasion, content);
  if (problems.length) throw new HttpError(400, problems.join(' '));

  const eventAt = eventInstant(content) ?? invitation.eventAt;
  const validityDays = invitation.order?.package.linkValidityDays ?? 30;
  const expiresAt = eventAt ? addDays(eventAt, validityDays) : addDays(new Date(), validityDays);

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: 'PUBLISHED',
      publishedAt: invitation.publishedAt ?? new Date(),
      eventAt: eventAt ?? undefined,
      expiresAt,
      ogImageUrl: coverImage(content),
      editsAllowed: invitation.order?.package.editsAfterPublish ?? invitation.editsAllowed,
    },
  });
  await audit(user, { module: 'invitations', action: 'publish', entityType: 'Invitation', entityId: invitationId, summary: `Published ${invitationPath(updated.slug)}` });
  return updated;
}

export async function unpublish(user: SessionUser, invitationId: string) {
  const updated = await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'DRAFT' } });
  await audit(user, { module: 'invitations', action: 'unpublish', entityType: 'Invitation', entityId: invitationId });
  return updated;
}

// ---------------------------------------------------------------------------
// The guest side
// ---------------------------------------------------------------------------

export type PublicInvitation = NonNullable<Awaited<ReturnType<typeof loadPublic>>>;

/**
 * What the guest page renders. Null when the slug does not exist, is a draft
 * being previewed by nobody, or has expired. A preview by the owner or staff
 * shows a draft; everyone else sees 404 rather than an unfinished page.
 */
export async function loadPublic(slug: string, opts: { preview?: boolean } = {}) {
  const invitation = await prisma.invitation.findUnique({
    where: { slug },
    include: {
      template: true,
      tables: { orderBy: { sortOrder: 'asc' } },
      guestbook: { where: { approved: true }, orderBy: { createdAt: 'desc' }, take: 100 },
      media: { where: { kind: 'GUEST_PHOTO', approved: true }, orderBy: { createdAt: 'desc' }, take: 60 },
    },
  });
  if (!invitation) return null;
  if (invitation.status === 'ARCHIVED') return null;
  if (invitation.status !== 'PUBLISHED' && !opts.preview) return null;
  if (invitation.status === 'PUBLISHED' && invitation.expiresAt && invitation.expiresAt.getTime() < Date.now() && !opts.preview) {
    return { ...invitation, expired: true as const };
  }
  return { ...invitation, expired: false as const };
}

export async function checkGuestPassword(invitationId: string, password: string): Promise<boolean> {
  const row = await prisma.invitation.findUnique({ where: { id: invitationId }, select: { passwordHash: true } });
  if (!row?.passwordHash) return true;
  return verifyPassword(password, row.passwordHash);
}

/** One counter per day. Called from the page; never blocks rendering. */
export async function recordView(invitationId: string): Promise<void> {
  const day = new Date(`${manilaDateKey()}T00:00:00Z`);
  try {
    await prisma.$transaction([
      prisma.invitationView.upsert({
        where: { invitationId_day: { invitationId, day } },
        update: { count: { increment: 1 } },
        create: { invitationId, day, count: 1 },
      }),
      prisma.invitation.update({ where: { id: invitationId }, data: { viewCount: { increment: 1 } } }),
    ]);
  } catch (err) {
    console.error('[views]', (err as Error).message);
  }
}

/** RSVP is open unless the customer closed it, or the Complete-tier deadline has passed. */
export function rsvpOpen(invitation: { rsvpClosed: boolean; rsvpDeadline: Date | null; tier: Tier }): boolean {
  if (invitation.rsvpClosed) return false;
  if (hasFeature(invitation.tier, 'rsvp.autoClose') && invitation.rsvpDeadline && invitation.rsvpDeadline.getTime() < Date.now()) return false;
  return true;
}
