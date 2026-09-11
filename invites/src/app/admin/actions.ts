'use server';

import { wordsOf, artOf, LINE_KEYS, TITLE_KEYS, titleWord, BABYBLUE_GROUND_KEYS, documentOf, studioDoc, builtinDesign, starterDesign, designOf, blastRadius, offeredSections, type DesignDoc, type PageSpec, type PageSectionKey } from '@/lib/design';
import { pageNeeds } from '@/lib/needs';
import { designFiles } from '@/lib/design-files';
import { canAddPart, extraSectionsOf } from '@/lib/parts';
import { STAFF_BYLINE } from '@/lib/names';
import { freshNonce } from '@/lib/draft-link';
import { pieceOf, cleanName, cleanTags, type Piece } from '@/lib/library';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { DfyStatus, Occasion, Tier, DiscountType } from '@prisma/client';
import { requireStaffSession, assertPermission, HttpError } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { contentOf } from '@/lib/invitations';
import { hashPassword, changePassword } from '@/lib/auth';
import { eraseCustomer } from '@/lib/privacy';
import { audit } from '@/lib/audit';
import { reviewManualPayment, refundPayment } from '@/lib/payments';
import { activateOrder, cancelOrder } from '@/lib/orders';
import { assignJob, moveJob, staffReply, updateJobNotes, extendDue } from '@/lib/dfy';
import { setSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications';
import { isOccasion, OCCASIONS } from '@/lib/occasions';
import { TIERS } from '@/lib/tiers';
import { isCollection } from '@/lib/collections';
import { isOpening } from '@/lib/openings';
import { premiumOpeningAllowed, premiumOpeningsFor, PREMIUM_OPENING_BY_KEY } from '@/lib/premium-openings';
import { isLayout, PALETTE_PRESETS, FONT_PRESETS, paletteFrom } from '@/lib/theme';
import { isLook } from '@/lib/looks';
import { slugify } from '@/lib/codes';
import { toCents } from '@/lib/money';
import { addDays } from '@/lib/datetime';
import { OCCASION_SECTIONS, sectionOrder, isPaged, sectionFilled, sectionLabel, type SectionKey } from '@/lib/sections';
import { STAFF_ROLES } from '@/lib/rbac';
import type { Permission } from '@/lib/rbac';

/**
 * Admin actions. Each one names the permission it needs; the guard refuses
 * before any query runs. Outcomes go back to the page as ?ok= / ?error= so
 * a plain <form action> works without client JavaScript.
 */
async function run(permission: Permission, back: string, fn: (user: Awaited<ReturnType<typeof requireStaffSession>>) => Promise<string | void>) {
  const user = await requireStaffSession();
  assertPermission(user, permission);
  let message = '';
  try {
    message = (await fn(user)) ?? 'Saved.';
  } catch (err) {
    if (typeof (err as { digest?: string })?.digest === 'string') throw err;
    const text = err instanceof HttpError ? err.message : process.env.NODE_ENV === 'production' ? 'Something went wrong.' : String((err as Error)?.message ?? err);
    console.error('[admin action]', err);
    revalidatePath(back);
    redirect(`${back}${back.includes('?') ? '&' : '?'}error=${encodeURIComponent(text)}`);
  }
  revalidatePath(back);
  redirect(`${back}${back.includes('?') ? '&' : '?'}ok=${encodeURIComponent(message)}`);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string, fallback = 0) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? v : fallback; };
const b = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';

// --- payments & orders ------------------------------------------------------

export async function reviewPaymentAction(paymentId: string, back: string, fd: FormData) {
  return run('payments.review', back, async (user) => {
    const decision = s(fd, 'decision') === 'approve' ? 'approve' : 'reject';
    await reviewManualPayment(user, paymentId, decision, s(fd, 'reason'));
    return decision === 'approve' ? 'Payment approved — order activated.' : 'Payment rejected; the customer has been told.';
  });
}

export async function refundAction(paymentId: string, back: string, fd: FormData) {
  return run('payments.refund', back, async (user) => {
    await refundPayment(user, paymentId, toCents(s(fd, 'amount')), s(fd, 'reason') || 'Refund');
    return 'Refund recorded.';
  });
}

export async function activateOrderAction(orderId: string, back: string) {
  return run('payments.review', back, async (user) => {
    await activateOrder(orderId, 'admin');
    await audit(user, { module: 'orders', action: 'activate.manual', entityType: 'Order', entityId: orderId, sensitive: true });
    return 'Order activated.';
  });
}

export async function cancelOrderAction(orderId: string, back: string, fd: FormData) {
  return run('orders.edit', back, async (user) => {
    await cancelOrder(user, orderId, s(fd, 'reason') || 'Cancelled by staff');
    return 'Order cancelled.';
  });
}

// --- DFY --------------------------------------------------------------------

export async function dfyAssignAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.assign', back, async (user) => { await assignJob(user, jobId, s(fd, 'assigneeId') || null); return 'Assigned.'; });
}
export async function dfyMoveAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.edit', back, async (user) => { await moveJob(user, jobId, s(fd, 'status') as DfyStatus); return 'Moved.'; });
}
export async function dfyReplyAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.edit', back, async (user) => { await staffReply(user, jobId, s(fd, 'body')); return 'Reply sent.'; });
}
export async function dfyNotesAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.edit', back, async (user) => { await updateJobNotes(user, jobId, s(fd, 'notes')); });
}
/**
 * Attach a premium opening drawn for this couple: the clip is made for one
 * invitation, overrides whatever its design ships with, and counts as the
 * premium opening whatever the package (see hasPremiumOpening). It hangs off
 * the job, so it is reachable on any Done-For-You or Priority order — the
 * package and the add-on are not what gate it.
 *
 * The pair is stored together or not at all — a clip with no poster leaves the
 * guest on a blank screen while it buffers, which is worse than no opening.
 */
export async function dfyOpeningAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.edit', back, async (user) => {
    const job = await prisma.dfyJob.findUniqueOrThrow({ where: { id: jobId }, include: { invitation: { select: { id: true, tier: true, title: true } } } });
    const video = s(fd, 'openingVideoUrl');
    const poster = s(fd, 'openingPosterUrl');
    if (video && !poster) throw new HttpError(400, 'A clip needs its poster too — that still is the closed screen until the guest taps.');
    await prisma.invitation.update({ where: { id: job.invitationId }, data: { openingVideoUrl: video, openingPosterUrl: video ? poster : '' } });
    await audit(user, {
      module: 'dfy', action: video ? 'opening.set' : 'opening.cleared', entityType: 'Invitation', entityId: job.invitationId,
      summary: video ? `Premium opening attached to ${job.invitation.title}.` : `Premium opening removed from ${job.invitation.title}.`,
    });
    return video ? 'Premium opening attached.' : 'Premium opening removed.';
  });
}
export async function dfyExtendAction(jobId: string, back: string, fd: FormData) {
  return run('dfy.edit', back, async (user) => { await extendDue(user, jobId, n(fd, 'days', 1)); return 'Deadline moved.'; });
}

// --- templates --------------------------------------------------------------

export async function saveTemplateAction(templateId: string | null, back: string, fd: FormData) {
  return run('templates.edit', back, async (user) => {
    const occasion = s(fd, 'occasion');
    if (!isOccasion(occasion)) throw new HttpError(400, 'Pick an occasion.');
    const layout = s(fd, 'layout');
    if (!isLayout(layout)) throw new HttpError(400, 'Pick a layout.');
    const palettePreset = PALETTE_PRESETS.find((p) => p.key === s(fd, 'paletteKey'));
    const palette = { bg: s(fd, 'bg'), surface: s(fd, 'surface'), ink: s(fd, 'ink'), muted: s(fd, 'muted'), accent: s(fd, 'accent'), accent2: s(fd, 'accent2') };
    const fonts = FONT_PRESETS.find((f) => f.key === s(fd, 'fontsKey'))?.fonts ?? FONT_PRESETS[0].fonts;
    /*
     * The ticks, for a design that has no document. A design drawn in the
     * studio has no ticks on its form at all — its document says which
     * sections it declines — so its column is left exactly as the last
     * publish wrote it rather than being emptied by a form that never
     * showed the question.
     */
    const drawn = templateId ? Boolean(documentOf(await prisma.template.findUnique({ where: { id: templateId }, select: { design: true, layout: true } }) ?? {})) : false;
    const ticked = OCCASION_SECTIONS[occasion as Occasion].filter((k) => fd.get(`section_${k}`) === 'on');
    // undefined leaves the column exactly as the last publish wrote it
    const sections = drawn ? undefined : ticked;
    const data = {
      name: s(fd, 'name'),
      slug: slugify(s(fd, 'slug') || s(fd, 'name')),
      occasion: occasion as Occasion,
      // the other occasions this design is offered for; the home one is never repeated here
      occasions: OCCASIONS.map((o) => o.key).filter((k) => k !== occasion && fd.get(`occ_${k}`) === 'on'),
      minTier: (TIERS.includes(s(fd, 'minTier') as Tier) ? s(fd, 'minTier') : 'BASIC') as Tier,
      premium: b(fd, 'premium'),
      description: s(fd, 'description'),
      thumbnailUrl: s(fd, 'thumbnailUrl'),
      layout,
      look: isLook(s(fd, 'look')) ? s(fd, 'look') : '',
      collection: isCollection(s(fd, 'collection')) ? s(fd, 'collection') : '',
      // A clip with no poster would leave the guest on a blank screen until it
      // buffered, so the pair only takes effect together.
      openingVideoUrl: s(fd, 'openingPosterUrl') ? s(fd, 'openingVideoUrl') : '',
      openingPosterUrl: s(fd, 'openingPosterUrl'),
      opening: isOpening(s(fd, 'opening')) && s(fd, 'opening') !== 'none' ? s(fd, 'opening') : '',
      palette: (palettePreset && !s(fd, 'bg') ? palettePreset.palette : palette) as never,
      fonts: fonts as never,
      sections,
      featured: b(fd, 'featured'),
      published: b(fd, 'published'),
      sortOrder: n(fd, 'sortOrder'),
      // the design's own words over its look's, and its own pictures; blank is the code's own
      words: wordsOf(Object.fromEntries((['en', 'tl'] as const).map((lang) => [lang, Object.fromEntries([...LINE_KEYS, ...TITLE_KEYS.map(titleWord)].map((k) => [k, s(fd, `words_${lang}_${k}`)]))]))) as never,
      art: artOf({
        backgrounds: Array.from({ length: 8 }, (_, i) => s(fd, `art_bg_${i + 1}`)),
        night: Array.from({ length: 8 }, (_, i) => s(fd, `art_night_${i + 1}`)),
        strand: s(fd, 'art_strand'),
        grounds: Object.fromEntries(BABYBLUE_GROUND_KEYS.map((k) => [k, s(fd, `art_ground_${k}`)])),
      }) as never,
    };
    if (!data.name) throw new HttpError(400, 'A template needs a name.');
    /*
     * A design made here starts with pages, so the studio has something to
     * open on. Before this it started with nothing and the only way to get a
     * design was to copy one of the two, which meant carrying their page
     * names and their proportions whether they were wanted or not.
     *
     * It goes in the draft, never in what a guest renders: a design is
     * published from the studio and nowhere else.
     */
    const start = !templateId && isPaged(layout)
      // in the layout's own order, not the form's: a starter should read like
      // an invitation — the story and the details, then the forms and the
      // countdown — rather than like the list of questions it came from
      ? (s(fd, 'startFrom') === 'layout' ? builtinDesign(layout) : null)
        ?? starterDesign(sectionOrder(occasion as Occasion, layout).filter((k) => ticked.includes(k)))
      : null;
    const saved = templateId
      ? await prisma.template.update({ where: { id: templateId }, data })
      : await prisma.template.create({ data: { ...data, ...(start ? { designDraft: start as never } : {}) } });
    await audit(user, { module: 'templates', action: templateId ? 'update' : 'create', entityType: 'Template', entityId: saved.id, summary: saved.name });
    if (!templateId) redirect(`/admin/templates/${saved.id}?ok=Created`);
    return 'Template saved.';
  });
}

/**
 * Copy a design, so the studio has something to draw on.
 *
 * The copy starts life holding the original's document: for Capiz and Baby
 * Blue that is the built-in compiled from the constants the renderer draws
 * with, so the copy renders exactly like the original from the first minute.
 * It goes in `designDraft`, not `design` — the copy is unpublished and a
 * guest sees nothing of it until she presses Publish in the studio.
 *
 * The copy points at the original's pictures rather than taking its own
 * copies of them. For the two designs this exists to copy that is simply
 * right: their grounds are files shipped with the app. A ground she uploads
 * in the studio is written under the copy's own id, so the two only ever
 * share a picture neither of them owns.
 */
export async function duplicateTemplateAction(templateId: string, back: string) {
  return run('templates.edit', back, async (user) => {
    const src = await prisma.template.findUniqueOrThrow({ where: { id: templateId } });
    const doc = documentOf(src) ?? builtinDesign(src.layout);
    if (!doc) throw new HttpError(400, 'Only a design with pages of its own can be copied — Capiz, Baby Blue, or a copy of one.');
    const taken = new Set((await prisma.template.findMany({ select: { slug: true } })).map((t) => t.slug));
    const stem = slugify(`${src.slug}-copy`);
    let slug = stem;
    for (let i = 2; taken.has(slug); i++) slug = `${stem}-${i}`;
    const made = await prisma.template.create({
      data: {
        name: `${src.name} copy`,
        slug,
        occasion: src.occasion,
        occasions: src.occasions,
        minTier: src.minTier,
        premium: src.premium,
        description: src.description,
        thumbnailUrl: src.thumbnailUrl,
        layout: src.layout,
        collection: src.collection,
        opening: src.opening,
        openingVideoUrl: src.openingVideoUrl,
        openingPosterUrl: src.openingPosterUrl,
        palette: src.palette as never,
        fonts: src.fonts as never,
        look: src.look,
        words: src.words as never,
        art: src.art as never,
        sections: src.sections,
        // a copy is nobody's design yet: not published, not featured, and no
        // demo of its own until one is made for it
        demoSlug: '',
        featured: false,
        published: false,
        sortOrder: src.sortOrder,
        designDraft: doc as never,
      },
    });
    await audit(user, { module: 'templates', action: 'create', entityType: 'Template', entityId: made.id, summary: `${made.name} (copied from ${src.name})` });
    redirect(`/admin/templates/${made.id}?ok=${encodeURIComponent('Copied. It is unpublished until you say otherwise.')}`);
  });
}

// --- the design studio ------------------------------------------------------

/**
 * Save the draft.
 *
 * `baseRev` is the revision she loaded. If the row has moved on, somebody
 * else saved while she was drawing and her save is refused rather than
 * quietly overwriting theirs — she is told, and can reload and redo the last
 * few minutes rather than lose an afternoon of somebody else's.
 *
 * The document is parsed on the way in and refused if anything would be
 * dropped, so a draft that cannot be read back is never written: the studio
 * would then be editing something the guest page will not render.
 */
export async function saveDesignDraftAction(templateId: string, baseRev: number, json: string) {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId }, select: { layout: true, designDraftRev: true } });
  if (t.designDraftRev !== baseRev) {
    return { ok: false as const, rev: t.designDraftRev, error: 'Somebody else saved this design while you were working. Reload to see their version before saving yours.' };
  }
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ok: false as const, rev: t.designDraftRev, error: 'The draft could not be read.' }; }
  const read = designOf(raw, t.layout);
  if (!read.doc) return { ok: false as const, rev: t.designDraftRev, error: 'The draft could not be read.' };
  if (read.dropped.length) {
    return { ok: false as const, rev: t.designDraftRev, error: `Not saved — this would have lost ${read.dropped.join(', ')}.` };
  }
  const saved = await prisma.template.update({
    where: { id: templateId },
    data: { designDraft: read.doc as never, designDraftRev: { increment: 1 } },
    select: { designDraftRev: true },
  });
  return { ok: true as const, rev: saved.designDraftRev };
}

/**
 * A link to the unfinished design, for somebody with no account.
 *
 * `?design=draft` is a previewer's view and stays one; this hands out a key
 * beside it. The key names one design and is honoured only on that design's
 * own demo invitation, so it can never be pointed at a customer's
 * invitation to read their names and their guest list.
 *
 * Sharing again gives back the same link rather than a second one: two live
 * links to one design is two things to remember to stop.
 */
export async function shareDesignDraftAction(templateId: string, back: string) {
  return run('templates.edit', back, async (user) => {
    const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId }, select: { shareNonce: true, demoSlug: true, name: true } });
    if (!t.demoSlug) throw new HttpError(400, 'This design has no demo invitation, so there is no page to share. Give it one on the template\u2019s own page.');
    if (t.shareNonce) return 'It is already shared. The link is in the top bar.';
    await prisma.template.update({ where: { id: templateId }, data: { shareNonce: freshNonce() } });
    await audit(user, { module: 'templates', action: 'update', entityType: 'Template', entityId: templateId, summary: `${t.name}: the draft design is shared by link` });
    // the link itself is drawn by the studio from the secret, so it is always
    // the current one rather than whatever a flash message said once
    return 'Shared. The link is in the top bar, to copy and send.';
  });
}

/** Stop sharing: one new secret, and every link handed out so far is dead. */
export async function stopSharingDesignDraftAction(templateId: string, back: string) {
  return run('templates.edit', back, async (user) => {
    const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId }, select: { shareNonce: true, name: true } });
    if (!t.shareNonce) return 'That design was not shared.';
    await prisma.template.update({ where: { id: templateId }, data: { shareNonce: '' } });
    await audit(user, { module: 'templates', action: 'update', entityType: 'Template', entityId: templateId, summary: `${t.name}: the draft link was stopped` });
    return 'Stopped. Every link you handed out has stopped working.';
  });
}

// --- a page from another design --------------------------------------------

/**
 * The pages of every other design, to copy one from.
 *
 * A page she has already drawn is the best starting point for the next one
 * like it, and designs accumulate: the third christening wants the second's
 * story page. Each design is read the way a guest would see it — the
 * published document if it has one, the draft if not, and the layout's
 * built-in if neither — because that is the version she has actually
 * looked at.
 */
export async function pagesToCopyAction(exceptId: string): Promise<{ id: string; name: string; pages: { key: string; label: string; drawn: boolean; elements: number; ground?: string }[] }[]> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const rows = await prisma.template.findMany({
    where: { id: { not: exceptId } },
    orderBy: { name: 'asc' },
    take: 60,
    select: { id: true, name: true, layout: true, design: true, designDraft: true },
  });
  const out = [];
  for (const t of rows) {
    const doc = studioDoc(t);
    if (!doc?.pages.length) continue;
    out.push({
      id: t.id,
      name: t.name,
      pages: doc.pages.map((pg) => ({
        key: pg.key,
        label: pg.label?.en ?? pg.key,
        drawn: Boolean(pg.drawn),
        elements: pg.elements?.length ?? 0,
        ...(pg.ground && 'url' in pg.ground ? { ground: pg.ground.url } : {}),
      })),
    });
  }
  return out;
}

/** One page of another design, whole, to drop into this one. */
export async function copyPageAction(templateId: string, key: string): Promise<{ ok: true; page: PageSpec } | { ok: false; error: string }> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const t = await prisma.template.findUnique({ where: { id: templateId }, select: { layout: true, design: true, designDraft: true } });
  if (!t) return { ok: false, error: 'That design is not there any more.' };
  const page = studioDoc(t)?.pages.find((p) => p.key === key);
  if (!page) return { ok: false, error: 'That page is not on that design any more.' };
  // its own address for the ground and for every picture on it: the file is
  // shared rather than copied, so nothing is uploaded twice and neither
  // design can break the other by being edited
  return { ok: true, page };
}

// --- who the canvas is drawn against ---------------------------------------

/**
 * The invitations built on one design, so the canvas can be drawn against
 * one of them.
 *
 * The customer's own title is the name, because what she is choosing is
 * "whose words do I want to see this page with" and that list has to read
 * like the invitation list she already knows. Newest first and capped: a
 * design with two thousand invitations is a menu nobody can use, and the
 * ones she wants to look at are the recent ones.
 */
export async function invitationsToDrawAction(templateId: string): Promise<{ id: string; title: string; tier: Tier; status: string }[]> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  assertPermission(user, 'invitations.view');
  const rows = await prisma.invitation.findMany({
    where: { templateId },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true, title: true, tier: true, status: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, tier: r.tier, status: r.status }));
}

/**
 * One invitation's answers, for the canvas to draw a page against.
 *
 * Read-only by construction rather than by promise: the studio hands this
 * to the canvas as what it draws, and everything the studio saves is the
 * design document, which has no customer's words in it at all. The only
 * way this could reach an invitation is if somebody wrote that code, and
 * there is none.
 *
 * Scoped to the design, so an id from anywhere else cannot be read through
 * the studio; and reading a customer's answers is an invitations
 * permission, not a design one, so it asks for that as well.
 */
export async function invitationContentAction(templateId: string, id: string): Promise<
  { ok: true; title: string; content: Record<string, unknown> } | { ok: false; error: string }
> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  assertPermission(user, 'invitations.view');
  const inv = await prisma.invitation.findFirst({ where: { id, templateId }, select: { title: true, content: true } });
  if (!inv) return { ok: false, error: 'That invitation is not on this design any more.' };
  return { ok: true, title: inv.title, content: contentOf(inv.content) as Record<string, unknown> };
}

// --- the theme -------------------------------------------------------------

/**
 * The design's colours and its faces.
 *
 * These two are columns on the row and not part of the design document, so
 * they sit outside the draft-and-publish discipline the pages live under: a
 * save here is felt by every invitation on this design at once, the live
 * ones included. Which is why the studio lets her try a palette on the
 * canvas for as long as she likes and nothing leaves the browser until she
 * presses this — and why this says, afterwards, how many invitations it
 * reached.
 *
 * The faces are named rather than described: the studio sends the key of a
 * set in our list, not a font stack of its own, so nothing a browser is
 * handed to set the page in can be composed from outside. No key at all
 * means leave the faces as they are, which is how a design set in faces
 * that are not one of our sets can still have its colours changed without
 * being quietly re-set in somebody else's.
 */
export async function themeAction(templateId: string, colours: Record<string, string>, fontsKey: string): Promise<
  { ok: true; live: number; drafts: number } | { ok: false; error: string }
> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const roles = ['bg', 'surface', 'ink', 'muted', 'accent', 'accent2'] as const;
  const labels: Record<string, string> = { bg: 'The paper', surface: 'The card', ink: 'The ink', muted: 'The muted ink', accent: 'The accent', accent2: 'The second accent' };
  const bad = roles.find((r) => !/^#[0-9a-f]{6}$/i.test(colours[r] ?? ''));
  if (bad) return { ok: false, error: `${labels[bad]} is not a colour. Each of the six is a six-digit hex, like #f7f5f0.` };
  const set = fontsKey ? FONT_PRESETS.find((f) => f.key === fontsKey) : undefined;
  if (fontsKey && !set) return { ok: false, error: 'That font set is not one of ours.' };
  const t = await prisma.template.findUnique({ where: { id: templateId }, select: { name: true, palette: true, fonts: true } });
  if (!t) return { ok: false, error: 'That design is not there any more.' };
  const palette = paletteFrom(Object.fromEntries(roles.map((r) => [r, colours[r]])));
  const [live, drafts] = await Promise.all([
    prisma.invitation.count({ where: { templateId, status: 'PUBLISHED' } }),
    prisma.invitation.count({ where: { templateId, status: { not: 'PUBLISHED' } } }),
  ]);
  await prisma.template.update({
    where: { id: templateId },
    data: { palette: palette as never, ...(set ? { fonts: set.fonts as never } : {}) },
  });
  await audit(user, {
    module: 'templates', action: 'theme', entityType: 'Template', entityId: templateId,
    summary: `${t.name}: ${set ? set.label : 'the faces unchanged'}, ${live} live and ${drafts} draft invitations`,
    before: { palette: t.palette, fonts: t.fonts } as never,
    after: { palette, fonts: set ? set.fonts : t.fonts } as never,
  });
  return { ok: true, live, drafts };
}

// --- the library -----------------------------------------------------------

/**
 * The pieces she has uploaded, newest first.
 *
 * Called from the studio rather than rendered into it, because the drawer
 * has to show a piece the moment it is uploaded and a page reload in the
 * middle of drawing would lose her place.
 */
export async function listPiecesAction(): Promise<Piece[]> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const rows = await prisma.media.findMany({
    where: { kind: 'DESIGN_PIECE' },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, url: true, name: true, tags: true, width: true, height: true, animated: true },
  });
  return rows.map(pieceOf);
}

/**
 * Keep a picture already uploaded to a design in the library too.
 *
 * The file is not copied: a second row points at the same object, because
 * the picture is the same picture and storing it twice would only make two
 * things to delete. The row is what the library lists.
 */
export async function keepPieceAction(url: string, name: string, tags: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const from = await prisma.media.findFirst({
    where: { url, kind: { in: ['DESIGN_IMAGE', 'DESIGN_PIECE'] } },
    select: { storagePath: true, contentType: true, width: true, height: true, bytes: true },
  });
  if (!from) return { ok: false, error: 'That picture is not one of this design\u2019s own uploads, so there is nothing to keep.' };
  const already = await prisma.media.findFirst({ where: { url, kind: 'DESIGN_PIECE' }, select: { id: true } });
  if (already) return { ok: false, error: 'It is in the library already.' };
  await prisma.media.create({
    data: {
      userId: user.id, kind: 'DESIGN_PIECE', url,
      storagePath: from.storagePath, contentType: from.contentType,
      width: from.width, height: from.height, bytes: from.bytes,
      name: cleanName(name), tags: cleanTags(tags),
    },
  });
  await audit(user, { module: 'templates', action: 'create', entityType: 'Media', entityId: url, summary: `a piece was kept in the library: ${cleanName(name) || url}` });
  return { ok: true };
}

/** Rename a piece, or change the words she would find it by. */
export async function namePieceAction(id: string, name: string, tags: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const row = await prisma.media.findFirst({ where: { id, kind: 'DESIGN_PIECE' }, select: { id: true } });
  if (!row) return { ok: false, error: 'That piece is not in the library.' };
  await prisma.media.update({ where: { id }, data: { name: cleanName(name), tags: cleanTags(tags) } });
  return { ok: true };
}

/**
 * Take a piece out of the library.
 *
 * The row goes; the file stays. By the time a piece has been in the library
 * a week it may be on any number of pages, and those pages keep its address
 * rather than a reference to this row \u2014 so deleting the file would break
 * them silently, which is the one thing the library promises not to do.
 */
export async function dropPieceAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaffSession();
  assertPermission(user, 'templates.edit');
  const row = await prisma.media.findFirst({ where: { id, kind: 'DESIGN_PIECE' }, select: { id: true, name: true, url: true } });
  if (!row) return { ok: false, error: 'That piece is not in the library.' };
  await prisma.media.delete({ where: { id } });
  await audit(user, { module: 'templates', action: 'delete', entityType: 'Media', entityId: row.url, summary: `a piece was taken out of the library: ${row.name || row.url}` });
  return { ok: true };
}

/**
 * Make the draft live for every invitation on this design.
 *
 * The document it replaces goes on the audit row, which is what Restore
 * previous reads. One step back only: publishing twice loses the older one,
 * as the studio says on the button.
 */
export async function publishDesignAction(templateId: string, back: string) {
  return run('templates.publish', back, async (user) => {
    const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId } });
    const draft = documentOf({ design: t.designDraft, layout: t.layout });
    if (!draft) throw new HttpError(400, 'There is no draft to publish.');
    /*
     * The checklist is a promise, not a decoration: a line that says the
     * design will be wrong for somebody has to stop the publish, and it has
     * to stop it here rather than only on the screen — the screen is a
     * courtesy and this is the door. The page lists them; this repeats the
     * first, so a refusal is never mysterious.
     */
    // the same two maps the studio screen read, so the door and the screen
    // cannot disagree: a clip budget the screen blocks on and the door does
    // not enforce is a suggestion, not a rule
    const files = await designFiles(t.id);
    const wrong = pageNeeds({ doc: draft, occasion: t.occasion, weights: files.weights, lengths: files.lengths }).filter((n) => n.level === 'blocks');
    if (wrong.length) {
      throw new HttpError(400, `${wrong.length} thing${wrong.length === 1 ? '' : 's'} to fix before this can be published. The first: ${wrong[0].text}`);
    }
    const before = documentOf(t) ?? builtinDesign(t.layout);
    const invitations = await prisma.invitation.findMany({ where: { templateId }, select: { status: true, content: true } });
    const radius = blastRadius(before, draft, invitations);
    /*
     * The column is written from the document, not beside it. Everything
     * that has been taught to read the document ignores `sections` for a
     * design that carries one; this keeps the column true for anything that
     * has not, and makes it a copy of the answer rather than a rival to it.
     */
    await prisma.template.update({
      where: { id: templateId },
      data: { design: draft as never, sections: offeredSections(draft, t.occasion) },
    });
    await audit(user, {
      module: 'templates', action: 'publish-design', entityType: 'Template', entityId: templateId,
      summary: `${t.name}: ${radius.live} live and ${radius.drafts} draft invitations`,
      before: (before ?? {}) as never, after: draft as never,
    });
    return `Published. ${radius.live} live and ${radius.drafts} draft invitations are drawn from it now.`;
  });
}

/** Throw away what has not been published. The published design is untouched. */
export async function discardDesignDraftAction(templateId: string, back: string) {
  return run('templates.edit', back, async (user) => {
    await prisma.template.update({ where: { id: templateId }, data: { designDraft: {}, designDraftRev: { increment: 1 } } });
    await audit(user, { module: 'templates', action: 'discard-design-draft', entityType: 'Template', entityId: templateId });
    return 'Draft discarded. What is published is unchanged.';
  });
}

/**
 * Bring back the version published just before this one, as a draft she can
 * look at before publishing it again. Restoring never goes live on its own.
 */
export async function restoreDesignAction(templateId: string, back: string) {
  return run('templates.publish', back, async (user) => {
    const last = await prisma.auditLog.findFirst({
      where: { entityType: 'Template', entityId: templateId, action: 'publish-design' },
      orderBy: { createdAt: 'desc' },
    });
    const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId }, select: { layout: true } });
    const previous = documentOf({ design: last?.before, layout: t.layout });
    if (!previous) throw new HttpError(400, 'There is no previous version to restore: this design has been published once or not at all.');
    await prisma.template.update({ where: { id: templateId }, data: { designDraft: previous as never, designDraftRev: { increment: 1 } } });
    await audit(user, { module: 'templates', action: 'restore-design', entityType: 'Template', entityId: templateId, after: previous as never });
    return 'The previous version is back as a draft. Look it over, then publish it.';
  });
}

// --- customers --------------------------------------------------------------

export async function customerNotesAction(userId: string, back: string, fd: FormData) {
  return run('customers.edit', back, async () => { await prisma.user.update({ where: { id: userId }, data: { notes: s(fd, 'notes').slice(0, 8000) } }); });
}
export async function customerActiveAction(userId: string, back: string, fd: FormData) {
  return run('customers.edit', back, async (user) => {
    const active = b(fd, 'active');
    await prisma.user.update({ where: { id: userId }, data: { active, sessionsRevoked: active ? undefined : new Date() } });
    await audit(user, { module: 'customers', action: active ? 'enable' : 'disable', entityType: 'User', entityId: userId, sensitive: true });
    return active ? 'Account enabled.' : 'Account disabled and signed out.';
  });
}

/**
 * The Data Privacy Act's right to erasure, carried out on a written request.
 * Deliberately not reversible and deliberately noisy in the audit log: the
 * reason typed here is the only record of who asked and how.
 */
export async function eraseCustomerAction(userId: string, back: string, fd: FormData) {
  return run('customers.edit', back, async (user) => {
    const reason = s(fd, 'reason').trim();
    if (reason.length < 10) throw new HttpError(400, 'Record where the request came from — at least a sentence.');
    if (s(fd, 'confirm') !== 'ERASE') throw new HttpError(400, 'Type ERASE to confirm.');
    const report = await eraseCustomer(user, userId, reason);
    return `Erased. Removed ${report.invitations} invitation(s), ${report.guests} guest(s), ${report.rsvps} RSVP(s), ${report.photos} photo(s). Kept ${report.ordersKept} order(s) as receipts.`;
  });
}

// --- invitations ------------------------------------------------------------

export async function extendExpiryAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    const days = n(fd, 'days', 30);
    const expiresAt = addDays(inv.expiresAt && inv.expiresAt > new Date() ? inv.expiresAt : new Date(), days);
    await prisma.invitation.update({ where: { id: invitationId }, data: { expiresAt, status: inv.status === 'EXPIRED' ? 'PUBLISHED' : inv.status } });
    await audit(user, { module: 'invitations', action: 'extend', entityType: 'Invitation', entityId: invitationId, summary: `+${days} days` });
    await notify(inv.userId, 'Link extended', `Your invitation link now runs until ${expiresAt.toDateString()}.`, `/account/invitations/${invitationId}`);
    return `Extended by ${days} days.`;
  });
}
export async function setTierAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const tier = s(fd, 'tier') as Tier;
    // Checked against TIERS, not a list typed out here. The list said
    // BASIC | STANDARD | COMPLETE and stayed saying it when Luxury was added,
    // so the select offered a package the action then refused as "Bad tier" —
    // the one control for moving a customer onto the top package, broken by
    // the arrival of the top package.
    if (!TIERS.includes(tier)) throw new HttpError(400, 'Bad tier.');
    // The tier is all there is to move now: it used to carry a revision count
    // across from the package, and revisions no longer outlive publishing.
    await prisma.invitation.update({ where: { id: invitationId }, data: { tier } });
    await audit(user, { module: 'invitations', action: 'tier.set', entityType: 'Invitation', entityId: invitationId, summary: tier, sensitive: true });
    return `Tier set to ${tier}.`;
  });
}
/**
 * The premium opening add-on, switched by hand: for an order paid outside the
 * site, a gift, or a refund. Bought with an order it is set on activation.
 */
export async function setPremiumOpeningAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const on = s(fd, 'premiumOpening') === 'on';
    await prisma.invitation.update({ where: { id: invitationId }, data: { premiumOpening: on } });
    await audit(user, { module: 'invitations', action: on ? 'premiumOpening.on' : 'premiumOpening.off', entityType: 'Invitation', entityId: invitationId, sensitive: true });
    return on ? 'Premium opening switched on.' : 'Premium opening switched off.';
  });
}
/**
 * Which of the design's premium openings this invitation plays. The customer
 * picks their own in Settings; staff set it for a Done-For-You order, or when
 * a couple asks over Messenger. A clip from another theme is refused.
 */
export async function setPremiumOpeningClipAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const key = s(fd, 'premiumOpeningKey');
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { template: true } });
    if (!premiumOpeningAllowed(inv.template, key)) throw new HttpError(400, 'That opening was not made for this design.');
    await prisma.invitation.update({ where: { id: invitationId }, data: { premiumOpeningKey: key } });
    await audit(user, { module: 'invitations', action: 'premiumOpening.clip', entityType: 'Invitation', entityId: invitationId });
    return key ? `Opening set to ${PREMIUM_OPENING_BY_KEY[key]?.name ?? key}.` : 'Back to the design’s first opening.';
  });
}
/**
 * A whole part added to one invitation: a programme on a design with no
 * programme page, a gift note on one that never had one.
 *
 * Here rather than in the studio because the studio's edits land on every
 * invitation the design carries, and a couple asking for one page is not a
 * reason to move the other forty. The design is untouched; the renderer gives
 * the part a page of its own on the design's overflow ground.
 *
 * It buys nothing. `canAddPart` asks the package the same question the
 * customer's own form asks, and refuses with the package that would include
 * it named, so nobody ticks a Luxury page onto a Basic card by accident.
 */
export async function addPartAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const key = s(fd, 'part');
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { template: true } });
    const verdict = canAddPart(inv, inv.template, key);
    if (!verdict.ok) throw new HttpError(400, verdict.why);
    await prisma.invitation.update({ where: { id: invitationId }, data: { extraSections: { push: key } } });
    await audit(user, { module: 'invitations', action: 'part.add', entityType: 'Invitation', entityId: invitationId, summary: verdict.label });
    /*
     * Only worth saying when there is nothing written in it yet: the part
     * appears when it has words, and a staff member who ticks it on and looks
     * at the page would otherwise see nothing and think the tick failed.
     */
    const empty = !sectionFilled(key as SectionKey, inv.occasion, contentOf(inv.content)[key as SectionKey]);
    return `${verdict.label} added to this invitation.${empty ? ' It appears once there is something written in it.' : ''}`;
  });
}
/** Taking it off again: the page goes, the words stay where they were typed. */
export async function dropPartAction(invitationId: string, back: string, fd: FormData) {
  return run('invitations.edit', back, async (user) => {
    const key = s(fd, 'part');
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId }, include: { template: true } });
    const carried = extraSectionsOf(inv.extraSections);
    if (!carried.includes(key as SectionKey)) throw new HttpError(400, 'That part is not one this invitation carries.');
    const label = sectionLabel(key as SectionKey, inv.occasion);
    await prisma.invitation.update({ where: { id: invitationId }, data: { extraSections: carried.filter((k) => k !== key) } });
    await audit(user, { module: 'invitations', action: 'part.drop', entityType: 'Invitation', entityId: invitationId, summary: label });
    return `${label} taken off. Anything written in it is still saved.`;
  });
}
export async function archiveInvitationAction(invitationId: string, back: string) {
  return run('invitations.edit', back, async (user) => {
    await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'ARCHIVED' } });
    await audit(user, { module: 'invitations', action: 'archive', entityType: 'Invitation', entityId: invitationId, sensitive: true });
    return 'Archived.';
  });
}

// --- coupons ----------------------------------------------------------------

export async function saveCouponAction(couponId: string | null, back: string, fd: FormData) {
  return run('coupons.manage', back, async (user) => {
    const type = (s(fd, 'type') === 'FIXED' ? 'FIXED' : 'PERCENT') as DiscountType;
    const data = {
      code: s(fd, 'code').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30),
      type,
      value: type === 'PERCENT' ? Math.max(1, Math.min(100, n(fd, 'value'))) : toCents(s(fd, 'value')),
      minSpendCents: toCents(s(fd, 'minSpend') || '0'),
      expiresAt: s(fd, 'expiresAt') ? new Date(`${s(fd, 'expiresAt')}T23:59:59+08:00`) : null,
      usageLimit: s(fd, 'usageLimit') ? n(fd, 'usageLimit') : null,
      active: b(fd, 'active'),
      note: s(fd, 'note'),
    };
    if (data.code.length < 3) throw new HttpError(400, 'Codes need at least 3 characters.');
    const saved = couponId ? await prisma.coupon.update({ where: { id: couponId }, data }) : await prisma.coupon.create({ data });
    await audit(user, { module: 'coupons', action: couponId ? 'update' : 'create', entityType: 'Coupon', entityId: saved.id, summary: saved.code, sensitive: true });
    return 'Coupon saved.';
  });
}

// --- support ----------------------------------------------------------------

export async function supportReplyAction(userId: string, back: string, fd: FormData) {
  return run('support.reply', back, async (user) => {
    const body = s(fd, 'body').slice(0, 4000);
    if (!body) throw new HttpError(400, 'Write a reply.');
    await prisma.supportMessage.create({ data: { userId, fromStaff: true, body, channel: 'app' } });
    await prisma.supportMessage.updateMany({ where: { userId, fromStaff: false, readAt: null }, data: { readAt: new Date() } });
    await notify(userId, `Reply from ${STAFF_BYLINE}`, body.slice(0, 120), '/account/support');
    return 'Reply sent.';
  });
}

// --- settings ---------------------------------------------------------------

export async function saveSettingsAction(keys: string[], back: string, fd: FormData) {
  return run('settings.edit', back, async (user) => {
    const entries: Record<string, unknown> = {};
    for (const key of keys) {
      const raw = fd.get(key);
      if (key === 'payments.bankAccounts') {
        const rows: { bank: string; name: string; number: string }[] = [];
        for (let i = 0; i < 6; i++) {
          const bank = s(fd, `bank_${i}`);
          if (bank) rows.push({ bank, name: s(fd, `bankName_${i}`), number: s(fd, `bankNumber_${i}`) });
        }
        entries[key] = rows;
      } else if (raw === 'on' || raw === 'off') entries[key] = raw === 'on';
      else if (raw === null) entries[key] = false;
      else if (/^(dfy|concierge|rush|orders)\./.test(key)) entries[key] = Number(raw) || 0;
      else entries[key] = String(raw);
    }
    await setSettings(entries, user.id);
    await audit(user, { module: 'settings', action: 'update', entityType: 'Setting', summary: keys.join(', '), sensitive: true });
  });
}

export async function savePackageAction(packageId: string, back: string, fd: FormData) {
  return run('settings.edit', back, async (user) => {
    const data = {
      name: s(fd, 'name'),
      tagline: s(fd, 'tagline'),
      priceCents: toCents(s(fd, 'price')),
      dfyFeeCents: toCents(s(fd, 'dfyFee')),
      conciergeFeeCents: toCents(s(fd, 'conciergeFee')),
      revisionRounds: n(fd, 'rounds', 2),
      linkValidityDays: n(fd, 'validity', 30),
      active: b(fd, 'active'),
    };
    await prisma.package.update({ where: { id: packageId }, data });
    await audit(user, { module: 'settings', action: 'package.update', entityType: 'Package', entityId: packageId, summary: data.name, sensitive: true });
  });
}

export async function saveAddOnAction(addOnId: string | null, back: string, fd: FormData) {
  return run('settings.edit', back, async (user) => {
    const data = { code: s(fd, 'code').toUpperCase().replace(/[^A-Z0-9_]/g, ''), name: s(fd, 'name'), description: s(fd, 'description'), imageUrl: s(fd, 'imageUrl'), priceCents: toCents(s(fd, 'price')), quoted: b(fd, 'quoted'), active: b(fd, 'active'), sortOrder: n(fd, 'sortOrder') };
    if (!data.code || !data.name) throw new HttpError(400, 'Code and name are required.');
    const saved = addOnId ? await prisma.addOn.update({ where: { id: addOnId }, data }) : await prisma.addOn.create({ data });
    await audit(user, { module: 'settings', action: 'addon.save', entityType: 'AddOn', entityId: saved.id, summary: saved.name, sensitive: true });
  });
}

// --- users ------------------------------------------------------------------

export async function saveStaffAction(userId: string | null, back: string, fd: FormData) {
  return run('users.manage', back, async (user) => {
    const role = s(fd, 'role');
    if (!STAFF_ROLES.includes(role as never)) throw new HttpError(400, 'Pick a staff role.');
    const email = s(fd, 'email').toLowerCase();
    const password = s(fd, 'password');
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          name: s(fd, 'name'),
          role: role as never,
          active: b(fd, 'active'),
          ...(password ? { passwordHash: await hashPassword(password), mustChangePassword: true, sessionsRevoked: new Date() } : {}),
          ...(b(fd, 'active') ? {} : { sessionsRevoked: new Date() }),
        },
      });
    } else {
      if (!email || password.length < 8) throw new HttpError(400, 'Email and a password of 8+ characters are required.');
      await prisma.user.create({ data: { email, name: s(fd, 'name') || email, role: role as never, passwordHash: await hashPassword(password), mustChangePassword: true } });
    }
    await audit(user, { module: 'users', action: userId ? 'update' : 'create', entityType: 'User', entityId: userId ?? email, sensitive: true });
    return 'Staff account saved.';
  });
}

export async function staffChangePasswordAction(_prev: { error?: string; ok?: boolean }, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireStaffSession();
  try {
    await changePassword(user.id, s(fd, 'current'), s(fd, 'next'));
  } catch (err) {
    return { error: err instanceof HttpError ? err.message : 'Could not change the password.' };
  }
  redirect('/admin');
}
