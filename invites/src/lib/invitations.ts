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
  keepStaffFields,
  publishProblems,
  readForward,
  rsvpDeadline,
  sectionUnlocked,
  coverImage,
  type Content,
  type SectionData,
  type SectionKey,
  OCCASION_SECTIONS,
  sectionOnCard,
  sectionOffered,
} from './sections';
import { templateSuits } from './occasions';
import { hasFeature, entitled, TIER_LABELS } from './tiers';
import { saveTheDateOffered } from './pricing';
import { isStaff, can } from './rbac';
import { addDays, manilaDateKey } from './datetime';
import { audit } from './audit';
import type { Lang } from './copy';
import { PALETTE_PRESETS, FONT_PRESETS, paletteFrom, fontsFrom, type Palette, type Fonts } from './theme';
import { LOOK_BY_KEY, BASE_LOOK, isLook, lookAllowed, type Look } from './looks';
import { hasPremiumOpening } from './openings';
import { premiumOpeningAllowed } from './premium-openings';
import { invitationPath } from './app-url';
import { changeWindow, withDone, formComplete, doneSections, type Progress } from './progress';
import { documentOf } from './design';
import { designForm, askedFields } from './asks';
import { notifyStaff } from './notifications';
import { formatDate } from './datetime';

/**
 * The invitation's lifecycle: a draft is created at checkout, unlocked when
 * the order activates, edited section by section, published to a slug, and
 * expires after the event. Content is JSON shaped by sections.ts; this module
 * is the only writer of it.
 */

export type ThemeMode = 'day' | 'night' | 'auto';
export type ThemeOverride = { paletteKey?: string; palette?: Partial<Palette>; fontsKey?: string; lookKey?: string; mode?: ThemeMode };
export type StoredContent = Content & { theme?: ThemeOverride; progress?: Progress };

/**
 * Three weeks before the event the invitation closes to the couple's changes
 * and passes to our team for the final touches. Staff are never locked out.
 */
export function assertOpenForChanges(user: SessionUser, invitation: { eventAt: Date | null }) {
  if (user.role !== 'CUSTOMER') return;
  const w = changeWindow(invitation.eventAt);
  if (w?.closed) throw new HttpError(403, `Changes closed on ${formatDate(w.closesAt)}, three weeks before your event, so our team can finish the final touches by ${formatDate(w.finalAt)}. Message us for anything urgent.`);
}

/**
 * Revisions happen before we publish. The customer reviews a preview, tells us
 * what to change, and those rounds are counted on the job; publishing is the
 * end of that conversation, not the start of a second one. An invitation
 * guests are already opening is not edited underneath them by the person who
 * asked for it — a half-finished save would be live on somebody's phone.
 *
 * So a published invitation is closed to its customer, and it is a rule rather
 * than an allowance: there is no number of changes left to spend, and no row
 * an admin can raise to reopen one by accident. Staff are never gated, because
 * after publish a change is ours to make — that is what "message us" means.
 */
export function assertNotPublished(user: SessionUser, invitation: { status: string }) {
  if (user.role !== 'CUSTOMER') return;
  if (invitation.status === 'PUBLISHED') {
    throw new HttpError(403, 'Your invitation is already live, so changes to it are ours to make. Message us on Messenger or Viber and we will sort it out.');
  }
}

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
  'account', 'admin', 'api', 'checkout', 'collections', 'coming-soon', 'demo', 'login', 'logout', 'looks', 'occasions',
  'privacy', 'refund-policy', 'signup', 'templates', 'terms',
  // Files under src/app that serve their own path.
  'robots.txt', 'sitemap.xml', 'favicon.ico',
  // The old guest prefix, which now redirects to the root.
  'i',
  // Never route these, whatever src/app happens to hold today.
  'pricing', 'g', 'new', 'edit', 'preview', 'print', 'card', '_next', 'static',
]);

export function contentOf(raw: unknown): StoredContent {
  // readForward, not a cast alone: a section whose shape changed since this
  // invitation was saved is read into the shape the spec now names.
  return readForward((raw && typeof raw === 'object' ? raw : {}) as StoredContent);
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
  if (!templateSuits(template, args.occasion)) throw new HttpError(400, 'That template is for a different occasion.');

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

/**
 * The Save the Date for an invitation: a second card, months ahead of the one
 * it announces.
 *
 * It is a row of its own rather than another face on the invitation, because
 * the two are finished at different times. A Save the Date goes out when the
 * couple has a date and not much else; the invitation is published when they
 * have a venue, a programme and a dress code. Sharing a record would mean
 * publishing in June to announce a December wedding — starting the revision
 * count and settling the design six months early.
 *
 * What it copies is what makes the pair look like one suite: the design, the
 * palette and fonts, the couple's names and their cover photo. What it does
 * not copy is everything a Save the Date has no business asking.
 *
 * It carries no revision count of its own. Rounds of changes belong to the
 * build behind an order, and this card has no order — it is the couple's to
 * edit until they publish it, and ours to change after, like any invitation.
 */
export async function createSaveTheDate(parent: {
  id: string;
  userId: string;
  templateId: string;
  occasion: Occasion;
  tier: Tier;
  title: string;
  slug: string;
  language: string;
  eventAt: Date | null;
  content: unknown;
}) {
  if (!saveTheDateOffered(parent.occasion)) throw new HttpError(400, 'A Save the Date is not offered for this occasion.');
  const existing = await prisma.invitation.findUnique({ where: { saveTheDateOfId: parent.id }, select: { id: true } });
  if (existing) return prisma.invitation.findUniqueOrThrow({ where: { id: existing.id } });

  const from = contentOf(parent.content);
  const cover: SectionData = { ...(from.cover ?? {}) };
  // The wedding cover already knows how to announce itself as a Save the Date;
  // every other occasion is told by the row it sits in. Either way the couple
  // can still change the card type in their builder.
  if (parent.occasion === 'WEDDING') cover.kind = 'saveTheDate';
  // The opening is the invitation's moment. A Save the Date wants to be read
  // on the spot, not unwrapped.
  delete cover.opening;
  delete cover.envelope;

  const content: Content = { cover, ...(from.countdown ? { countdown: from.countdown } : {}), ...(from.theme ? { theme: from.theme } : {}) };

  return prisma.invitation.create({
    data: {
      saveTheDateOfId: parent.id,
      userId: parent.userId,
      templateId: parent.templateId,
      occasion: parent.occasion,
      tier: parent.tier,
      title: `${parent.title} — Save the Date`,
      slug: await uniqueSlug(`${parent.slug}-save-the-date`),
      content: content as never,
      language: parent.language,
      eventAt: parent.eventAt,
    },
  });
}

/** Whether the order behind this invitation has been paid. Drafts are read-only until then. */
export function unlocked(invitation: { order: { status: string } | null }): boolean {
  return invitation.order?.status === 'ACTIVE' || invitation.order?.status === 'PAID' || invitation.order === null;
}

export async function saveSection(user: SessionUser, invitationId: string, key: SectionKey, raw: unknown, opts: { done?: boolean } = {}) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { order: { select: { status: true } }, template: { select: { design: true, layout: true } } },
  });
  if (!invitation) throw new HttpError(404, 'That invitation does not exist.');
  assertNotPublished(user, invitation);
  assertOpenForChanges(user, invitation);
  if (!sectionOnCard(key, invitation.occasion, Boolean(invitation.saveTheDateOfId))) throw new HttpError(400, 'That section does not belong to this card.');
  if (!sectionUnlocked(key, invitation.occasion, invitation.tier, invitation.addOns)) {
    throw new HttpError(403, 'That section is not included in your package. Upgrade to unlock it.');
  }
  if (!unlocked(invitation)) throw new HttpError(402, 'Your order is not paid yet. The builder unlocks once payment is confirmed.');

  /*
   * Fitted to the design before it is cleaned, so the cap the form counted
   * down from is the cap the save keeps. The form is a courtesy; this is
   * where a design's twenty letters actually become twenty. A design with no
   * document of its own changes nothing, which is every design today.
   */
  const fields = askedFields(
    fieldsFor(key, invitation.occasion, undefined, Boolean(invitation.saveTheDateOfId)),
    key,
    designForm(documentOf(invitation.template), invitation.occasion),
  );
  const { data: cleaned, issues } = cleanSection(fields, raw);
  const content = contentOf(invitation.content);
  // the fixed writings are ours: a customer's save keeps them as they were
  const data = isStaff(user.role) && can(user.role, 'invitations.edit') ? cleaned : keepStaffFields(fields, content[key], cleaned);
  content[key] = data;
  // Done, section by section; the form is complete once every section the couple has is Done, and the team is told
  let completed = false;
  if (opts.done !== undefined) {
    content.progress = withDone(content.progress, key, opts.done);
    const mine = OCCASION_SECTIONS[invitation.occasion].filter((k) => sectionOffered(k) && sectionUnlocked(k, invitation.occasion, invitation.tier, invitation.addOns));
    if (formComplete(content.progress, mine) && !content.progress.completedAt) {
      content.progress.completedAt = new Date().toISOString();
      completed = true;
    }
  }

  const eventAt = eventInstant(content);
  const deadline = rsvpDeadline(content);
  const title = displayTitle(invitation.occasion, content);

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      content: content as never,
      title,
      eventAt: eventAt ?? undefined,
      rsvpDeadline: deadline ?? undefined,
      ogImageUrl: coverImage(content),
    },
  });
  if (completed) {
    await audit(user, { module: 'invitations', action: 'form.complete', entityType: 'Invitation', entityId: invitationId, summary: `Every section marked Done: ${title}` });
    await notifyStaff('invitations.view', `Form complete: ${title}`, 'Every section is marked Done. The invitation is ready for our team.', `/admin/invitations/${invitationId}`);
  }
  return { invitation: updated, issues, done: doneSections(content.progress), completedAt: content.progress?.completedAt ?? null };
}

/** Reopen (or close) one section without touching what it holds. Counts as no edit. */
export async function setSectionDone(user: SessionUser, invitationId: string, key: SectionKey, done: boolean) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  assertNotPublished(user, invitation);
  assertOpenForChanges(user, invitation);
  const content = contentOf(invitation.content);
  content.progress = withDone(content.progress, key, done);
  await prisma.invitation.update({ where: { id: invitationId }, data: { content: content as never } });
  return doneSections(content.progress);
}

export async function updateTheme(user: SessionUser, invitationId: string, theme: ThemeOverride) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  assertNotPublished(user, invitation);
  assertOpenForChanges(user, invitation);
  const clean: ThemeOverride = {};
  // Colours are every package's: the presets and the picker alike.
  if (theme.paletteKey && PALETTE_PRESETS.some((p) => p.key === theme.paletteKey)) clean.paletteKey = theme.paletteKey;
  if (theme.palette) clean.palette = paletteFrom({ ...PALETTE_PRESETS[0].palette, ...theme.palette });
  if (theme.fontsKey && FONT_PRESETS.some((f) => f.key === theme.fontsKey)) {
    if (!hasFeature(invitation.tier, 'fonts.custom')) throw new HttpError(403, `Font presets are included in the ${TIER_LABELS.COMPLETE} package.`);
    clean.fontsKey = theme.fontsKey;
  }
  // A look is the faces and the lines under the headings. Basic keeps the
  // design's own; Standard chooses among three, Signature among five.
  if (theme.lookKey !== undefined) {
    const key = isLook(theme.lookKey) ? theme.lookKey : '';
    if (!lookAllowed(invitation.tier, key)) {
      throw new HttpError(403, hasFeature(invitation.tier, 'fonts.choice')
        ? `That font style is included in the ${TIER_LABELS.COMPLETE} package.`
        : `The Basic package is set in one font style. Standard chooses among three, ${TIER_LABELS.COMPLETE} among five.`);
    }
    clean.lookKey = key;
  }
  // Day, night, or by the guest's clock; the guest can still switch on the page.
  if (theme.mode !== undefined) clean.mode = theme.mode === 'night' || theme.mode === 'auto' ? theme.mode : 'day';
  const content = contentOf(invitation.content);
  content.theme = { ...(content.theme ?? {}), ...clean };
  return prisma.invitation.update({ where: { id: invitationId }, data: { content: content as never } });
}

/**
 * Which of the design's premium openings this invitation plays.
 *
 * The add-on buys the premium opening; this only says which one, among the
 * clips drawn for the design. A key from another theme is refused rather than
 * stored, so no christening can end up behind a wedding's seal.
 */
export async function setPremiumOpening(user: SessionUser, invitationId: string, key: string) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { template: true } });
  assertOpenForChanges(user, invitation);
  if (!hasPremiumOpening(invitation)) throw new HttpError(403, 'The premium opening is an add-on. Add it to your order and this choice opens up.');
  if (!premiumOpeningAllowed(invitation.template, key)) throw new HttpError(400, 'That opening was not made for this design.');
  return prisma.invitation.update({ where: { id: invitationId }, data: { premiumOpeningKey: key } });
}

/** The palette and fonts a page renders with: the template's, overridden by the customer's. */
/**
 * The palette, the fonts and the look a page is set in. The design's own
 * first, then what the customer chose over it. A look brings its fonts with
 * it — that is what a look is — so a chosen look wins over a chosen font
 * preset, and a design with a look ignores its own `fonts` column.
 */
export function resolveTheme(template: { palette: unknown; fonts: unknown; look?: string }, content: StoredContent, tier?: Tier): { palette: Palette; fonts: Fonts; look?: Look } {
  let palette = paletteFrom(template.palette);
  let fonts = fontsFrom(template.fonts);
  let look: Look | undefined = template.look && isLook(template.look) ? LOOK_BY_KEY[template.look] : undefined;
  // A design drawn in a look above the package is set in the one every package
  // has: Basic is Modern, whatever the design ships in.
  if (tier && look && !lookAllowed(tier, look.key)) look = LOOK_BY_KEY[BASE_LOOK];
  const t = content.theme;
  if (t?.paletteKey) {
    const preset = PALETTE_PRESETS.find((p) => p.key === t.paletteKey);
    if (preset) palette = preset.palette;
  }
  if (t?.palette) palette = paletteFrom({ ...palette, ...t.palette });
  if (t?.fontsKey) {
    const preset = FONT_PRESETS.find((f) => f.key === t.fontsKey);
    if (preset) {
      fonts = preset.fonts;
      look = undefined;
    }
  }
  // A look chosen above the package — an invitation downgraded after the fact —
  // is ignored, so the page shows only what was paid for.
  if (t?.lookKey && isLook(t.lookKey) && (!tier || lookAllowed(tier, t.lookKey))) look = LOOK_BY_KEY[t.lookKey];
  if (look) fonts = look.fonts;
  return { palette, fonts, look };
}

export async function updateSettings(
  user: SessionUser,
  invitationId: string,
  input: { slug?: string; privacy?: Privacy; password?: string; language?: Lang; title?: string },
) {
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  const data: Record<string, unknown> = {};
  // the words and the language are the invitation; the link and who may open it stay the couple's to change
  if (input.language !== undefined || input.title !== undefined) assertOpenForChanges(user, invitation);

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
    if (input.privacy === 'PASSWORD' && !entitled(invitation, 'privacy.password')) {
      throw new HttpError(403, `Password protection is included in the ${TIER_LABELS.COMPLETE} package.`);
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
  assertNotPublished(user, invitation);
  assertOpenForChanges(user, invitation);
  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || !template.published || template.occasion !== invitation.occasion) throw new HttpError(400, 'That template is not available for this invitation.');
  if (template.premium && !hasFeature(invitation.tier, 'templates.premium')) throw new HttpError(403, `That design is only in the ${TIER_LABELS.COMPLETE} package.`);
  if (!hasFeature(invitation.tier, 'templates.any') && template.minTier !== 'BASIC') throw new HttpError(403, 'The Basic tier includes designs from the Basic set. Upgrade to choose any template.');
  await prisma.invitation.update({ where: { id: invitationId }, data: { templateId } });
  await audit(user, { module: 'invitations', action: 'template.change', entityType: 'Invitation', entityId: invitationId, summary: `Switched to ${template.name}` });
}

/**
 * Publishing with blanks is allowed, and recorded.
 *
 * A customer who has not written their story, has no program and does not want
 * an FAQ has a shorter invitation, and waiting for boxes they will never fill
 * is how an invitation misses its own event. So the required cover fields still
 * hold a publish (there is no invitation without names and a date), and
 * everything else may be sent empty — but the customer is shown exactly which
 * parts are blank and what will not appear, and the sections they agreed to
 * send that way are written into their own progress record, so the team
 * working on it afterwards can see what was left on purpose rather than
 * chasing it.
 */
export async function publish(user: SessionUser, invitationId: string, acceptedBlanks?: string[]) {
  const invitation = await prisma.invitation.findUniqueOrThrow({
    where: { id: invitationId },
    // A Save the Date has no order of its own — it was bought as an add-on on
    // the invitation it announces, and it borrows that order's package.
    include: { order: { include: { package: true } }, saveTheDateOf: { include: { order: { include: { package: true } } } } },
  });
  if (!unlocked(invitation)) throw new HttpError(402, 'Your order is not paid yet.');
  const content = contentOf(invitation.content);
  const problems = publishProblems(invitation.occasion, content);
  if (problems.length) throw new HttpError(400, problems.join(' '));

  const eventAt = eventInstant(content) ?? invitation.eventAt;
  // Thirty days is the floor for an invitation with no package behind it. A
  // Save the Date published a year out would expire long before the wedding it
  // announces, so it takes the package's validity from the order it came with.
  const validityDays = (invitation.order ?? invitation.saveTheDateOf?.order)?.package.linkValidityDays ?? 30;
  const expiresAt = eventAt ? addDays(eventAt, validityDays) : addDays(new Date(), validityDays);

  const blanks = (acceptedBlanks ?? []).filter((k) => typeof k === 'string').slice(0, 40);
  const progress = blanks.length ? { ...(content.progress ?? {}), sentBlank: blanks, sentBlankAt: new Date().toISOString() } : content.progress;

  const updated = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: 'PUBLISHED',
      publishedAt: invitation.publishedAt ?? new Date(),
      eventAt: eventAt ?? undefined,
      expiresAt,
      ogImageUrl: coverImage(content),
      ...(blanks.length ? { content: { ...content, progress } as never } : {}),
    },
  });
  await audit(user, { module: 'invitations', action: 'publish', entityType: 'Invitation', entityId: invitationId, summary: `Published ${invitationPath(updated.slug)}${blanks.length ? ` — sent with ${blanks.length} section${blanks.length === 1 ? '' : 's'} left blank` : ''}` });
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

/** RSVP is open unless the customer closed it, or the Signature-package deadline has passed. */
export function rsvpOpen(invitation: { rsvpClosed: boolean; rsvpDeadline: Date | null; tier: Tier }): boolean {
  if (invitation.rsvpClosed) return false;
  if (hasFeature(invitation.tier, 'rsvp.autoClose') && invitation.rsvpDeadline && invitation.rsvpDeadline.getTime() < Date.now()) return false;
  return true;
}
