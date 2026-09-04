'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { DfyStatus, Occasion, Tier, DiscountType } from '@prisma/client';
import { requireStaffSession, assertPermission, HttpError } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { hashPassword, changePassword } from '@/lib/auth';
import { eraseCustomer } from '@/lib/privacy';
import { audit } from '@/lib/audit';
import { reviewManualPayment, refundPayment } from '@/lib/payments';
import { activateOrder, cancelOrder } from '@/lib/orders';
import { assignJob, moveJob, staffReply, updateJobNotes, extendDue } from '@/lib/dfy';
import { setSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications';
import { isOccasion } from '@/lib/occasions';
import { isLayout, PALETTE_PRESETS, FONT_PRESETS } from '@/lib/theme';
import { slugify } from '@/lib/codes';
import { toCents } from '@/lib/money';
import { addDays } from '@/lib/datetime';
import { OCCASION_SECTIONS } from '@/lib/sections';
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
    const sections = OCCASION_SECTIONS[occasion as Occasion].filter((k) => fd.get(`section_${k}`) === 'on');
    const data = {
      name: s(fd, 'name'),
      slug: slugify(s(fd, 'slug') || s(fd, 'name')),
      occasion: occasion as Occasion,
      minTier: (['BASIC', 'STANDARD', 'COMPLETE'].includes(s(fd, 'minTier')) ? s(fd, 'minTier') : 'BASIC') as Tier,
      premium: b(fd, 'premium'),
      description: s(fd, 'description'),
      thumbnailUrl: s(fd, 'thumbnailUrl'),
      layout,
      palette: (palettePreset && !s(fd, 'bg') ? palettePreset.palette : palette) as never,
      fonts: fonts as never,
      sections,
      featured: b(fd, 'featured'),
      published: b(fd, 'published'),
      sortOrder: n(fd, 'sortOrder'),
    };
    if (!data.name) throw new HttpError(400, 'A template needs a name.');
    const saved = templateId ? await prisma.template.update({ where: { id: templateId }, data }) : await prisma.template.create({ data });
    await audit(user, { module: 'templates', action: templateId ? 'update' : 'create', entityType: 'Template', entityId: saved.id, summary: saved.name });
    if (!templateId) redirect(`/admin/templates/${saved.id}?ok=Created`);
    return 'Template saved.';
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
    if (!['BASIC', 'STANDARD', 'COMPLETE'].includes(tier)) throw new HttpError(400, 'Bad tier.');
    await prisma.invitation.update({ where: { id: invitationId }, data: { tier, editsAllowed: tier === 'BASIC' ? 3 : -1 } });
    await audit(user, { module: 'invitations', action: 'tier.set', entityType: 'Invitation', entityId: invitationId, summary: tier, sensitive: true });
    return `Tier set to ${tier}.`;
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
    await notify(userId, `Reply from ${user.name}`, body.slice(0, 120), '/account/support');
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
      editsAfterPublish: n(fd, 'edits', -1),
      linkValidityDays: n(fd, 'validity', 30),
      active: b(fd, 'active'),
    };
    await prisma.package.update({ where: { id: packageId }, data });
    await audit(user, { module: 'settings', action: 'package.update', entityType: 'Package', entityId: packageId, summary: data.name, sensitive: true });
  });
}

export async function saveAddOnAction(addOnId: string | null, back: string, fd: FormData) {
  return run('settings.edit', back, async (user) => {
    const data = { code: s(fd, 'code').toUpperCase().replace(/[^A-Z0-9_]/g, ''), name: s(fd, 'name'), description: s(fd, 'description'), priceCents: toCents(s(fd, 'price')), quoted: b(fd, 'quoted'), active: b(fd, 'active'), sortOrder: n(fd, 'sortOrder') };
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
