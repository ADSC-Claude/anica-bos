'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { voucherCode } from '@/lib/codes';
import { sendRaw } from '@/lib/email';
import { dateKeyToBusinessDate, isBirthdayMonth } from '@/lib/datetime';
import { formatPeso } from '@/lib/money';
import { retentionWatch } from '@/lib/retention';

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const cents = (fd: FormData, k: string) => Math.round(Number(fd.get(k) ?? 0) * 100);

export async function savePromoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('marketing.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Give the promo a name.' };

  const type = (str(formData, 'type') || 'PERCENT') as 'PERCENT' | 'FIXED';
  const data = {
    name,
    description: str(formData, 'description'),
    type,
    value: type === 'FIXED' ? cents(formData, 'value') : Math.round(Number(formData.get('value') ?? 0)),
    startDate: dateKeyToBusinessDate(str(formData, 'startDate')),
    endDate: dateKeyToBusinessDate(str(formData, 'endDate')),
    serviceIds: formData.getAll('serviceIds').map(String).filter(Boolean),
    code: str(formData, 'code').toUpperCase() || null,
    active: formData.get('active') === 'on',
    showOnLanding: formData.get('showOnLanding') === 'on',
  };
  if (!str(formData, 'startDate') || !str(formData, 'endDate')) {
    return { error: 'Set the validity dates.' };
  }

  const promo = id
    ? await prisma.promo.update({ where: { id }, data })
    : await prisma.promo.create({ data });

  await audit(user, {
    module: 'marketing', action: id ? 'update_promo' : 'create_promo',
    entityType: 'Promo', entityId: promo.id,
    summary: `${id ? 'Updated' : 'Created'} promo "${promo.name}"`,
    sensitive: true, after: data,
  });
  revalidatePath('/portal/marketing');
  revalidatePath('/');
  return { ok: 'Saved. Active promos appear on the landing page immediately.' };
}

export async function savePackageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('marketing.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Give the package a name.' };

  const type = (str(formData, 'type') || 'SESSION_PACKAGE') as 'SESSION_PACKAGE' | 'MEMBERSHIP';
  const data = {
    name,
    type,
    description: str(formData, 'description'),
    priceCents: cents(formData, 'price'),
    validityDays: Math.round(Number(formData.get('validityDays') ?? 365)),
    memberDiscountPercent: Math.round(Number(formData.get('memberDiscountPercent') ?? 0)),
    birthdayPerkServiceId: str(formData, 'birthdayPerkServiceId') || null,
    active: formData.get('active') === 'on',
    showOnLanding: formData.get('showOnLanding') === 'on',
  };

  const pkg = id
    ? await prisma.package.update({ where: { id }, data })
    : await prisma.package.create({ data });

  // Session contents (only meaningful for session packages).
  const serviceIds = formData.getAll('itemServiceId').map(String);
  const sessions = formData.getAll('itemSessions').map(Number);
  if (type === 'SESSION_PACKAGE') {
    await prisma.packageItem.deleteMany({ where: { packageId: pkg.id } });
    for (const [i, serviceId] of serviceIds.entries()) {
      if (!serviceId || !sessions[i]) continue;
      await prisma.packageItem.create({
        data: { packageId: pkg.id, serviceId, sessions: sessions[i] },
      });
    }
  }

  await audit(user, {
    module: 'marketing', action: id ? 'update_package' : 'create_package',
    entityType: 'Package', entityId: pkg.id,
    summary: `${id ? 'Updated' : 'Created'} ${type.toLowerCase()} "${pkg.name}" at ${formatPeso(pkg.priceCents)}`,
    sensitive: true, after: data,
  });
  revalidatePath('/portal/marketing/packages');
  return { ok: 'Saved. Sell it at POS to create a client entitlement.' };
}

export async function issueVouchersAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('marketing.edit');
  const name = str(formData, 'batchName');
  const count = Math.min(500, Math.max(1, Math.round(Number(formData.get('count') ?? 1))));
  const type = (str(formData, 'type') || 'PERCENT') as 'PERCENT' | 'FIXED';
  const value = type === 'FIXED' ? cents(formData, 'value') : Math.round(Number(formData.get('value') ?? 0));
  const usesAllowed = Math.max(1, Math.round(Number(formData.get('usesAllowed') ?? 1)));
  const expiresKey = str(formData, 'expiresAt');

  if (!name) return { error: 'Name the batch, e.g. "October giveaway".' };
  if (value <= 0) return { error: 'Set the voucher value.' };

  const batch = await prisma.voucherBatch.create({ data: { name } });
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = voucherCode(str(formData, 'prefix') || 'ANC');
    while (await prisma.voucher.findUnique({ where: { code }, select: { id: true } })) {
      code = voucherCode(str(formData, 'prefix') || 'ANC');
    }
    await prisma.voucher.create({
      data: {
        code, batchId: batch.id, type, value, usesAllowed,
        expiresAt: expiresKey ? dateKeyToBusinessDate(expiresKey) : null,
        note: str(formData, 'note'),
      },
    });
    codes.push(code);
  }

  await audit(user, {
    module: 'marketing', action: 'issue_vouchers', entityType: 'VoucherBatch', entityId: batch.id,
    summary: `Issued ${count} voucher(s) in batch "${name}"`,
    sensitive: true,
  });
  revalidatePath('/portal/marketing/vouchers');
  return { ok: `Issued ${count} voucher(s): ${codes.slice(0, 5).join(', ')}${count > 5 ? '…' : ''}` };
}

/* ------------------------------------------------------------- campaigns */

export type CampaignState = FormState & {
  recipients?: { name: string; mobile: string; email: string }[];
  messageText?: string;
};

export async function buildCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const user = await requirePage('marketing.view');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const segment = str(formData, 'segment');
  const message = str(formData, 'message');

  let clients: { name: string; mobile: string; email: string }[] = [];

  if (segment === 'lapsed') {
    const rows = await retentionWatch([branchId], { fallbackDays: 60, onlyOverdue: true });
    clients = rows.map((r) => ({ name: r.name, mobile: r.mobile, email: r.email }));
  } else if (segment === 'birthday') {
    const all = await prisma.client.findMany({
      where: { branchId, birthday: { not: null } },
      select: { name: true, mobile: true, email: true, birthday: true },
    });
    clients = all
      .filter((c) => isBirthdayMonth(c.birthday))
      .map((c) => ({ name: c.name, mobile: c.mobile, email: c.email }));
  } else if (segment === 'top') {
    const rows = await prisma.client.findMany({
      where: { branchId },
      select: {
        name: true, mobile: true, email: true,
        sales: { where: { status: 'PAID' }, select: { totalCents: true } },
      },
    });
    clients = rows
      .map((c) => ({
        name: c.name, mobile: c.mobile, email: c.email,
        spend: c.sales.reduce((a, s) => a + s.totalCents, 0),
      }))
      .filter((c) => c.spend > 0)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 50)
      .map(({ name, mobile, email }) => ({ name, mobile, email }));
  } else if (segment === 'members') {
    const rows = await prisma.clientPackage.findMany({
      where: {
        status: 'ACTIVE',
        package: { type: 'MEMBERSHIP' },
        client: { branchId },
      },
      include: { client: { select: { name: true, mobile: true, email: true } } },
    });
    clients = rows.map((r) => r.client);
  } else {
    clients = await prisma.client.findMany({
      where: { branchId },
      select: { name: true, mobile: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  // Send now, if asked and the segment has emails.
  if (str(formData, 'send') === 'email' && message) {
    let sent = 0;
    for (const c of clients) {
      if (!c.email) continue;
      const result = await sendRaw({
        to: c.email,
        subject: str(formData, 'subject') || 'A note from ANICA Wellness Spa',
        text: message.replaceAll('{{name}}', c.name),
        template: `campaign:${segment}`,
      });
      if (result.ok) sent += 1;
    }
    await audit(user, {
      module: 'marketing', action: 'send_campaign', entityType: 'Campaign',
      summary: `Sent a "${segment}" email campaign to ${sent} client(s)`,
      sensitive: true, branchId,
    });
    return {
      ok: `Sent to ${sent} of ${clients.length} client(s). ${clients.length - sent} have no email on file.`,
      recipients: clients,
      messageText: message,
    };
  }

  return {
    ok: `${clients.length} client(s) in this segment.`,
    recipients: clients,
    messageText: message,
  };
}
