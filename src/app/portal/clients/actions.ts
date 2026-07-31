'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/guard';
import { audit, diff } from '@/lib/audit';
import { sendTemplateEmail } from '@/lib/email';
import { can } from '@/lib/rbac';

export type FormState = { error?: string; ok?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}

function normalizeMobile(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+63')) return '0' + digits.slice(3);
  if (digits.startsWith('63') && digits.length === 12) return '0' + digits.slice(2);
  return digits;
}

export async function saveClientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('clients.edit');
  const id = str(formData, 'id');
  const mobile = normalizeMobile(str(formData, 'mobile'));
  const name = str(formData, 'name');

  if (name.length < 2) return { error: 'Enter the client’s name.' };
  if (!/^09\d{9}$/.test(mobile)) {
    return { error: 'Enter a valid PH mobile number, e.g. 0917 123 4567.' };
  }

  const branchId = user.branchId ?? (await prisma.branch.findFirstOrThrow()).id;
  const birthdayRaw = str(formData, 'birthday');

  const data = {
    name,
    mobile,
    email: str(formData, 'email').toLowerCase(),
    birthday: birthdayRaw ? new Date(`${birthdayRaw}T00:00:00Z`) : null,
    addressCity: str(formData, 'addressCity'),
    addressLine: str(formData, 'addressLine'),
    barangay: str(formData, 'barangay'),
    notes: str(formData, 'notes'),
    pwdIdNumber: str(formData, 'pwdIdNumber'),
    seniorIdNumber: str(formData, 'seniorIdNumber'),
    tags: str(formData, 'tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    consentGiven: formData.get('consentGiven') === 'on',
  };

  // A record is "complete" once it carries the details the CRM needs.
  const incomplete = !data.email || !data.birthday || !data.addressCity;

  const duplicate = await prisma.client.findFirst({
    where: { branchId, mobile, ...(id ? { id: { not: id } } : {}) },
    select: { id: true, name: true },
  });
  if (duplicate) {
    return {
      error: `${duplicate.name} already uses that mobile number. Open their record instead, or use the merge tool.`,
    };
  }

  let clientId = id;
  if (id) {
    const before = await prisma.client.findUnique({ where: { id } });
    if (!before) return { error: 'That client no longer exists.' };
    const after = await prisma.client.update({
      where: { id },
      data: {
        ...data,
        incomplete,
        consentAt: data.consentGiven && !before.consentGiven ? new Date() : before.consentAt,
      },
    });
    await audit(user, {
      module: 'clients',
      action: 'update',
      entityType: 'Client',
      entityId: id,
      summary: `Updated client ${after.name}`,
      ...diff(before as never, after as never),
    });
  } else {
    const created = await prisma.client.create({
      data: {
        ...data,
        branchId,
        incomplete,
        consentAt: data.consentGiven ? new Date() : null,
      },
    });
    clientId = created.id;
    await audit(user, {
      module: 'clients',
      action: 'create',
      entityType: 'Client',
      entityId: created.id,
      summary: `Created client ${created.name}`,
      after: data,
    });
  }

  revalidatePath('/portal/clients');
  redirect(`/portal/clients/${clientId}`);
}

export async function saveMedicalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('clients.medical');
  const clientId = str(formData, 'clientId');
  if (!clientId) return { error: 'Missing client.' };

  const defs = await prisma.clientFieldDefinition.findMany({ where: { retired: false } });
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const def of defs) {
    const raw = formData.get(`field_${def.key}`);
    let value: unknown;
    if (def.type === 'BOOLEAN') value = raw === 'on';
    else if (def.type === 'MULTISELECT') value = formData.getAll(`field_${def.key}`).map(String);
    else if (def.type === 'NUMBER') value = raw ? Number(raw) : null;
    else value = raw ? String(raw).trim() : '';

    const existing = await prisma.clientFieldValue.findUnique({
      where: { clientId_definitionId: { clientId, definitionId: def.id } },
    });
    before[def.key] = existing?.value ?? null;
    after[def.key] = value;

    const empty =
      value === '' || value === null || value === false ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (existing) {
        await prisma.clientFieldValue.delete({ where: { id: existing.id } });
      }
      continue;
    }
    if (existing) {
      await prisma.clientFieldValue.update({
        where: { id: existing.id },
        data: { value: value as never },
      });
    } else {
      await prisma.clientFieldValue.create({
        data: { clientId, definitionId: def.id, value: value as never },
      });
    }
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      medicalUpdatedAt: new Date(),
      consentGiven: formData.get('consentGiven') === 'on',
      consentAt: formData.get('consentGiven') === 'on' ? new Date() : null,
    },
  });

  await audit(user, {
    module: 'clients',
    action: 'update_medical',
    entityType: 'Client',
    entityId: clientId,
    summary: 'Updated health intake',
    sensitive: true,
    ...diff(before as never, after as never),
  });

  revalidatePath(`/portal/clients/${clientId}`);
  return { ok: 'Health intake saved.' };
}

export async function addFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('clients.edit');
  const clientId = str(formData, 'clientId');
  const rating = Number(formData.get('rating') ?? 0);
  if (!clientId || rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5.' };

  await prisma.clientFeedback.create({
    data: {
      clientId,
      employeeId: str(formData, 'employeeId') || null,
      rating,
      comment: str(formData, 'comment'),
      recordedBy: user.name,
      // Never on by default. Quoting someone on a public page is a separate
      // act from them telling the receptionist they enjoyed it.
      showOnLanding: formData.get('showOnLanding') === 'on',
    },
  });
  await audit(user, {
    module: 'clients',
    action: 'add_feedback',
    entityType: 'Client',
    entityId: clientId,
    summary: `Recorded a ${rating}-star rating`,
  });
  revalidatePath(`/portal/clients/${clientId}`);
  return { ok: 'Feedback recorded.' };
}

export async function logFollowUpAction(formData: FormData) {
  const user = await requirePage('clients.edit');
  const clientId = str(formData, 'clientId');
  const channel = str(formData, 'channel') || 'call';
  const note = str(formData, 'note');
  if (!clientId) return;

  await prisma.clientFollowUp.create({
    data: { clientId, channel, note, userId: user.id, userName: user.name },
  });

  if (channel === 'email') {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (client?.email) {
      await sendTemplateEmail({
        to: client.email,
        template: 'birthday_greeting',
        clientId: client.id,
        vars: {
          clientName: client.name,
          promoText:
            note ||
            'It has been a while — we saved your favourite therapist a slot. Come see us soon!',
        },
      });
    }
  }

  // Give the client breathing room before they show up on the list again.
  await prisma.client.update({
    where: { id: clientId },
    data: { followUpSnoozedUntil: new Date(Date.now() + 30 * 86_400_000) },
  });

  await audit(user, {
    module: 'clients',
    action: 'follow_up',
    entityType: 'Client',
    entityId: clientId,
    summary: `Follow-up via ${channel}`,
  });
  revalidatePath('/portal/clients/follow-ups');
  revalidatePath(`/portal/clients/${clientId}`);
}

/** Merges `sourceId` into `targetId`, then removes the duplicate shell. */
export async function mergeClientsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('clients.merge');
  const targetId = str(formData, 'targetId');
  const sourceId = str(formData, 'sourceId');
  if (!targetId || !sourceId || targetId === sourceId) {
    return { error: 'Choose two different client records.' };
  }

  const [target, source] = await Promise.all([
    prisma.client.findUnique({ where: { id: targetId } }),
    prisma.client.findUnique({ where: { id: sourceId } }),
  ]);
  if (!target || !source) return { error: 'One of those records no longer exists.' };

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.sale.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.clientFeedback.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.clientFollowUp.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.clientPackage.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.loyaltyTransaction.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.emailLog.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.giftCertificate.updateMany({
      where: { buyerClientId: sourceId },
      data: { buyerClientId: targetId },
    });

    // Keep field answers the target does not already have.
    const sourceValues = await tx.clientFieldValue.findMany({ where: { clientId: sourceId } });
    for (const v of sourceValues) {
      const exists = await tx.clientFieldValue.findUnique({
        where: { clientId_definitionId: { clientId: targetId, definitionId: v.definitionId } },
      });
      if (!exists) {
        await tx.clientFieldValue.create({
          data: { clientId: targetId, definitionId: v.definitionId, value: v.value as never },
        });
      }
    }
    await tx.clientFieldValue.deleteMany({ where: { clientId: sourceId } });

    await tx.client.update({
      where: { id: targetId },
      data: {
        loyaltyPoints: target.loyaltyPoints + source.loyaltyPoints,
        email: target.email || source.email,
        birthday: target.birthday ?? source.birthday,
        addressCity: target.addressCity || source.addressCity,
        notes: [target.notes, source.notes].filter(Boolean).join('\n'),
        incomplete: false,
      },
    });
    await tx.corporateAccountClient.deleteMany({ where: { clientId: sourceId } });
    await tx.client.delete({ where: { id: sourceId } });
  });

  await audit(user, {
    module: 'clients',
    action: 'merge',
    entityType: 'Client',
    entityId: targetId,
    summary: `Merged "${source.name}" (${source.mobile}) into "${target.name}"`,
    sensitive: true,
    before: { source: { id: source.id, name: source.name, mobile: source.mobile } },
    after: { target: { id: target.id, name: target.name } },
  });

  revalidatePath('/portal/clients');
  redirect(`/portal/clients/${targetId}`);
}

export async function saveCorporateAccountAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('corporate.manage');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (name.length < 2) return { error: 'Enter the company name.' };

  const data = {
    name,
    tin: str(formData, 'tin'),
    billingAddress: str(formData, 'billingAddress'),
    contactPerson: str(formData, 'contactPerson'),
    contactMobile: str(formData, 'contactMobile'),
    contactEmail: str(formData, 'contactEmail'),
    discountType: (str(formData, 'discountType') || 'PERCENT') as 'PERCENT' | 'FIXED',
    discountValue: Math.round(Number(formData.get('discountValue') ?? 0)),
    creditLimitCents: Math.round(Number(formData.get('creditLimit') ?? 0) * 100),
    paymentTermsDays: Math.round(Number(formData.get('paymentTermsDays') ?? 30)),
    active: formData.get('active') === 'on',
  };

  const record = id
    ? await prisma.corporateAccount.update({ where: { id }, data })
    : await prisma.corporateAccount.create({ data });

  await audit(user, {
    module: 'clients',
    action: id ? 'update_corporate' : 'create_corporate',
    entityType: 'CorporateAccount',
    entityId: record.id,
    summary: `${id ? 'Updated' : 'Created'} corporate account ${record.name}`,
    sensitive: true,
    after: data,
  });
  revalidatePath('/portal/clients/corporate');
  return { ok: 'Saved.' };
}

export async function savePartnerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('partners.manage');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (name.length < 2) return { error: 'Enter the partner name.' };

  const code = str(formData, 'promoCode').toUpperCase() || null;
  if (code) {
    const clash = await prisma.partner.findFirst({
      where: { promoCode: code, ...(id ? { id: { not: id } } : {}) },
    });
    if (clash) return { error: `Code ${code} is already used by ${clash.name}.` };
  }

  const data = {
    name,
    type: str(formData, 'type') || 'hotel',
    contactPerson: str(formData, 'contactPerson'),
    contactMobile: str(formData, 'contactMobile'),
    contactEmail: str(formData, 'contactEmail'),
    feeType: (str(formData, 'feeType') || 'PERCENT') as 'PERCENT' | 'FIXED',
    feeValue:
      str(formData, 'feeType') === 'FIXED'
        ? Math.round(Number(formData.get('feeValue') ?? 0) * 100)
        : Math.round(Number(formData.get('feeValue') ?? 0)),
    guestDiscountType: (str(formData, 'guestDiscountType') || 'PERCENT') as 'PERCENT' | 'FIXED',
    guestDiscountValue: Math.round(Number(formData.get('guestDiscountValue') ?? 0)),
    promoCode: code,
    terms: str(formData, 'terms'),
    active: formData.get('active') === 'on',
  };

  const record = id
    ? await prisma.partner.update({ where: { id }, data })
    : await prisma.partner.create({ data });

  await audit(user, {
    module: 'clients',
    action: id ? 'update_partner' : 'create_partner',
    entityType: 'Partner',
    entityId: record.id,
    summary: `${id ? 'Updated' : 'Created'} partner ${record.name}`,
    sensitive: true,
    after: data,
  });
  revalidatePath('/portal/clients/partners');
  return { ok: 'Saved.' };
}

export async function linkClientToCorporateAction(formData: FormData) {
  const user = await requirePage('corporate.manage');
  const accountId = str(formData, 'accountId');
  const clientId = str(formData, 'clientId');
  if (!accountId || !clientId) return;
  await prisma.corporateAccountClient.upsert({
    where: { accountId_clientId: { accountId, clientId } },
    create: { accountId, clientId },
    update: {},
  });
  await audit(user, {
    module: 'clients',
    action: 'link_corporate_client',
    entityType: 'CorporateAccount',
    entityId: accountId,
    summary: `Linked a client to the corporate account`,
  });
  revalidatePath('/portal/clients/corporate');
}

export async function assertCanSeeMedical() {
  const user = await requirePage();
  return can(user.role, 'clients.medical');
}
