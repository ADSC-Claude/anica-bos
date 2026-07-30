'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePage, resolveBranchId } from '@/lib/guard';
import { audit, diff } from '@/lib/audit';
import { setSettings } from '@/lib/settings';
import { hashPassword } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { dateKeyToBusinessDate } from '@/lib/datetime';
import { ensureAccounts } from '@/lib/accounting';

export type FormState = { error?: string; ok?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const cents = (fd: FormData, k: string) => Math.round(num(fd, k) * 100);
const bool = (fd: FormData, k: string) => fd.get(k) === 'on';

/* ------------------------------------------------------------- settings */

export async function saveSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('settings.edit');
  const section = str(formData, 'section');

  // Anything that changes how money or receipts behave is Owner-only.
  const criticalSections = ['tax', 'gateway', 'branches'];
  if (criticalSections.includes(section)) {
    const owner = await requirePage('settings.critical');
    if (!owner) return { error: 'Only the Owner can change this section.' };
  }

  let entries: Record<string, unknown> = {};

  switch (section) {
    case 'business':
      entries = {
        'business.name': str(formData, 'name'),
        'business.tagline': str(formData, 'tagline'),
        'business.address': str(formData, 'address'),
        'business.contact': str(formData, 'contact'),
        'business.email': str(formData, 'email'),
        'business.facebook': str(formData, 'facebook'),
        'business.mapEmbedUrl': str(formData, 'mapEmbedUrl'),
        'business.logoUrl': str(formData, 'logoUrl'),
        'business.tin': str(formData, 'tin'),
        'business.openMinute': num(formData, 'openMinute'),
        'business.closeMinute': num(formData, 'closeMinute'),
        'business.receiptFooter': str(formData, 'receiptFooter'),
      };
      break;

    case 'tax':
      entries = {
        'tax.regime': str(formData, 'regime'),
        'tax.vatPercent': num(formData, 'vatPercent'),
        'tax.nonVatNotice': str(formData, 'nonVatNotice'),
        'tax.casAccredited': bool(formData, 'casAccredited'),
      };
      break;

    case 'booking':
      entries = {
        'booking.enabled': bool(formData, 'enabled'),
        'booking.depositPercent': num(formData, 'depositPercent'),
        'booking.expiryMinutes': num(formData, 'expiryMinutes'),
        'booking.leadTimeMinutes': num(formData, 'leadTimeMinutes'),
        'booking.slotStepMinutes': num(formData, 'slotStepMinutes'),
        'booking.manualFallbackEnabled': bool(formData, 'manualFallbackEnabled'),
        'booking.gcashName': str(formData, 'gcashName'),
        'booking.gcashNumber': str(formData, 'gcashNumber'),
        'booking.bankDetails': str(formData, 'bankDetails'),
        'booking.depositOnCancel': str(formData, 'depositOnCancel'),
      };
      break;

    case 'operations':
      entries = {
        'pos.discountApprovalPercent': num(formData, 'discountApprovalPercent'),
        'pos.tipsEnabled': bool(formData, 'tipsEnabled'),
        'pos.pettyCashFloatCents': cents(formData, 'pettyCashFloat'),
        'pos.pettyCashMinimumCents': cents(formData, 'pettyCashMinimum'),
        'loyalty.enabled': bool(formData, 'loyaltyEnabled'),
        'loyalty.pesosPerPoint': num(formData, 'pesosPerPoint'),
        'loyalty.pointValueCents': cents(formData, 'pointValue'),
        'rotation.rule': str(formData, 'rotationRule'),
        'retention.defaultThresholdDays': num(formData, 'retentionThresholdDays'),
        'inventory.autoDeductRecipes': bool(formData, 'autoDeductRecipes'),
        'membership.validityDays': num(formData, 'membershipValidityDays'),
        'membership.expiryAlertDays': num(formData, 'membershipExpiryAlertDays'),
        'membership.birthdayPerkEnabled': bool(formData, 'birthdayPerkEnabled'),
      };
      break;

    case 'payroll':
      entries = {
        'payroll.periodType': str(formData, 'periodType'),
        'payroll.dailyAllowanceCents': cents(formData, 'dailyAllowance'),
        'payroll.commissionPercent': num(formData, 'commissionPercent'),
        'payroll.lateDeductionType': str(formData, 'lateDeductionType'),
        'payroll.lateDeductionValue':
          str(formData, 'lateDeductionType') === 'FIXED'
            ? cents(formData, 'lateDeductionValue')
            : num(formData, 'lateDeductionValue'),
        'payroll.lateGraceMinutes': num(formData, 'lateGraceMinutes'),
        'payroll.absenceDeductionType': str(formData, 'absenceDeductionType'),
        'payroll.absenceDeductionValue':
          str(formData, 'absenceDeductionType') === 'FIXED'
            ? cents(formData, 'absenceDeductionValue')
            : num(formData, 'absenceDeductionValue'),
        'payroll.regularHolidayMultiplier': num(formData, 'regularHolidayMultiplier'),
        'payroll.specialHolidayMultiplier': num(formData, 'specialHolidayMultiplier'),
      };
      break;

    case 'comms':
      entries = {
        'email.enabled': bool(formData, 'emailEnabled'),
        'email.senderName': str(formData, 'senderName'),
        'email.birthdayGreetingEnabled': bool(formData, 'birthdayGreetingEnabled'),
        'sms.enabled': bool(formData, 'smsEnabled'),
      };
      // Editable email templates.
      for (const key of ['booking_received', 'booking_confirmed', 'booking_rejected', 'membership_expiring', 'birthday_greeting']) {
        const subject = str(formData, `tpl_${key}_subject`);
        const body = str(formData, `tpl_${key}_body`);
        if (subject) entries[`email.template.${key}.subject`] = subject;
        if (body) entries[`email.template.${key}.body`] = body;
      }
      break;

    default:
      return { error: 'Unknown settings section.' };
  }

  const before = await prisma.setting.findMany({
    where: { key: { in: Object.keys(entries) }, branchId: null },
  });
  await setSettings(entries, { userId: user.id });

  await audit(user, {
    module: 'settings', action: 'update', entityType: 'Setting', entityId: section,
    summary: `Updated the "${section}" settings`,
    sensitive: true,
    before: Object.fromEntries(before.map((b) => [b.key, b.value])),
    after: entries,
  });

  revalidatePath('/portal/settings');
  revalidatePath('/');
  return { ok: 'Settings saved.' };
}

/* ------------------------------------------------------- service catalog */

export async function saveServiceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('settings.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Enter the service name.' };

  const commissionType = str(formData, 'commissionType');
  const data = {
    name,
    categoryId: str(formData, 'categoryId'),
    description: str(formData, 'description'),
    durationMinutes: Math.max(5, num(formData, 'durationMinutes')),
    priceCents: cents(formData, 'price'),
    commissionType: commissionType ? (commissionType as 'PERCENT' | 'FIXED') : null,
    commissionValue: commissionType
      ? commissionType === 'FIXED'
        ? cents(formData, 'commissionValue')
        : num(formData, 'commissionValue')
      : null,
    active: bool(formData, 'active'),
    showOnLanding: bool(formData, 'showOnLanding'),
    sortRank: num(formData, 'sortRank'),
  };
  if (!data.categoryId) return { error: 'Choose a category.' };

  const before = id ? await prisma.service.findUnique({ where: { id } }) : null;
  const service = id
    ? await prisma.service.update({ where: { id }, data })
    : await prisma.service.create({ data });

  // Consumption recipe.
  const itemIds = formData.getAll('recipeItemId').map(String);
  const quantities = formData.getAll('recipeQty').map(Number);
  await prisma.serviceRecipe.deleteMany({ where: { serviceId: service.id } });
  for (const [i, itemId] of itemIds.entries()) {
    if (!itemId || !quantities[i]) continue;
    await prisma.serviceRecipe.create({
      data: { serviceId: service.id, itemId, quantity: quantities[i] },
    });
  }

  await audit(user, {
    module: 'settings', action: id ? 'update_service' : 'create_service',
    entityType: 'Service', entityId: service.id,
    summary: `${id ? 'Updated' : 'Created'} service "${service.name}"`,
    // Price changes are a sensitive action.
    sensitive: !before || before.priceCents !== service.priceCents,
    ...(before ? diff(before as never, service as never) : { after: data }),
  });

  revalidatePath('/portal/settings/services');
  revalidatePath('/');
  return { ok: 'Saved. The landing page updates immediately.' };
}

export async function saveServiceCategoryAction(formData: FormData) {
  const user = await requirePage('settings.edit');
  const name = str(formData, 'name');
  if (!name) return;
  const cat = await prisma.serviceCategory.create({
    data: { name, sortRank: num(formData, 'sortRank') },
  });
  await audit(user, {
    module: 'settings', action: 'create_service_category', entityType: 'ServiceCategory',
    entityId: cat.id, summary: `Added service category "${name}"`,
  });
  revalidatePath('/portal/settings/services');
}

export async function saveResourceAction(formData: FormData) {
  const user = await requirePage('settings.edit');
  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return;

  const data = {
    name,
    type: (str(formData, 'type') || 'BED') as never,
    capacity: Math.max(1, num(formData, 'capacity') || 1),
    active: bool(formData, 'active'),
    sortRank: num(formData, 'sortRank'),
  };
  const resource = id
    ? await prisma.resource.update({ where: { id }, data })
    : await prisma.resource.create({ data: { ...data, branchId } });

  await audit(user, {
    module: 'settings', action: id ? 'update_resource' : 'create_resource',
    entityType: 'Resource', entityId: resource.id,
    summary: `${id ? 'Updated' : 'Added'} room/bed "${name}"`, branchId,
  });
  revalidatePath('/portal/settings/resources');
}

/* ------------------------------------------------------- discount presets */

export async function saveDiscountPresetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('settings.edit');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Name the discount button.' };

  const type = (str(formData, 'type') || 'PERCENT') as 'PERCENT' | 'FIXED';
  const data = {
    name,
    type,
    value: type === 'FIXED' ? cents(formData, 'value') : num(formData, 'value'),
    serviceIds: formData.getAll('serviceIds').map(String).filter(Boolean),
    stackable: bool(formData, 'stackable'),
    requiresId: bool(formData, 'requiresId'),
    membersOnly: bool(formData, 'membersOnly'),
    isEmployeeRate: bool(formData, 'isEmployeeRate'),
    monthlyUsageLimit: num(formData, 'monthlyUsageLimit'),
    familyIncluded: bool(formData, 'familyIncluded'),
    active: bool(formData, 'active'),
    sortRank: num(formData, 'sortRank'),
  };

  const preset = id
    ? await prisma.discountPreset.update({ where: { id }, data })
    : await prisma.discountPreset.create({ data });

  await audit(user, {
    module: 'settings', action: id ? 'update_discount_preset' : 'create_discount_preset',
    entityType: 'DiscountPreset', entityId: preset.id,
    summary: `${id ? 'Updated' : 'Created'} discount button "${name}"`,
    sensitive: true, after: data,
  });
  revalidatePath('/portal/settings/discounts');
  return { ok: 'Saved. It appears at checkout immediately.' };
}

/* ------------------------------------------------------------ intake form */

export async function saveFieldDefinitionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('settings.edit');
  const id = str(formData, 'id');
  const label = str(formData, 'label');
  if (!label) return { error: 'Enter the question label.' };

  const data = {
    label,
    section: (str(formData, 'section') || 'MEDICAL') as 'PROFILE' | 'MEDICAL',
    type: (str(formData, 'type') || 'BOOLEAN') as never,
    options: str(formData, 'options').split(',').map((o) => o.trim()).filter(Boolean),
    helpText: str(formData, 'helpText'),
    required: bool(formData, 'required'),
    showOnline: bool(formData, 'showOnline'),
    alertValues: str(formData, 'alertValues').split(',').map((o) => o.trim()).filter(Boolean),
    sortRank: num(formData, 'sortRank'),
    retired: bool(formData, 'retired'),
  };

  if (id) {
    // Existing answers are preserved: only the definition changes.
    await prisma.clientFieldDefinition.update({ where: { id }, data });
  } else {
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const clash = await prisma.clientFieldDefinition.findUnique({ where: { key } });
    if (clash) return { error: 'A question with a similar name already exists.' };
    await prisma.clientFieldDefinition.create({ data: { ...data, key } });
  }

  await audit(user, {
    module: 'settings', action: id ? 'update_intake_field' : 'create_intake_field',
    entityType: 'ClientFieldDefinition', entityId: id,
    summary: `${id ? 'Updated' : 'Added'} intake question "${label}"`,
    sensitive: true, after: data,
  });
  revalidatePath('/portal/settings/intake');
  return { ok: 'Saved. The booking form and CRM intake screen update together.' };
}

/* ------------------------------------------------------------------ users */

export async function saveUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('users.manage');
  const id = str(formData, 'id');
  const email = str(formData, 'email').toLowerCase();
  const name = str(formData, 'name');
  const role = str(formData, 'role') as 'OWNER' | 'ADMIN' | 'RECEPTIONIST';
  const password = str(formData, 'password');
  const pin = str(formData, 'pin');

  if (!name || !email) return { error: 'Enter a name and email.' };
  if (!id && password.length < 10) {
    return { error: 'Set an initial password of at least 10 characters.' };
  }

  const clash = await prisma.user.findFirst({
    where: { email, ...(id ? { id: { not: id } } : {}) },
  });
  if (clash) return { error: 'That email is already used by another account.' };

  const branchId = await resolveBranchId(user, str(formData, 'branchId'));
  const base = {
    email, name, role, branchId,
    active: bool(formData, 'active'),
    employeeId: str(formData, 'employeeId') || null,
  };

  if (id) {
    const before = await prisma.user.findUnique({ where: { id } });
    await prisma.user.update({
      where: { id },
      data: {
        ...base,
        ...(password ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}),
        ...(pin ? { approvalPinHash: await bcrypt.hash(pin, 11) } : {}),
      },
    });
    await audit(user, {
      module: 'settings', action: 'update_user', entityType: 'User', entityId: id,
      summary: `Updated the account for ${name}${password ? ' and reset the password' : ''}`,
      sensitive: true,
      before: { email: before?.email, role: before?.role, active: before?.active },
      after: { email, role, active: base.active },
    });
  } else {
    const created = await prisma.user.create({
      data: {
        ...base,
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        ...(pin ? { approvalPinHash: await bcrypt.hash(pin, 11) } : {}),
      },
    });
    await audit(user, {
      module: 'settings', action: 'create_user', entityType: 'User', entityId: created.id,
      summary: `Created a ${role.toLowerCase()} account for ${name}`,
      sensitive: true, after: { email, role },
    });
  }

  revalidatePath('/portal/settings/users');
  return { ok: 'Saved. The account must change its password on first sign-in.' };
}

/* --------------------------------------------------------------- branches */

export async function saveBranchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('branches.manage');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  const code = str(formData, 'code').toUpperCase();
  if (!name || !code) return { error: 'Enter the branch name and a short code.' };

  const clash = await prisma.branch.findFirst({
    where: { code, ...(id ? { id: { not: id } } : {}) },
  });
  if (clash) return { error: `Code ${code} is already used by ${clash.name}.` };

  const data = {
    name, code,
    address: str(formData, 'address'),
    contact: str(formData, 'contact'),
    openMinute: num(formData, 'openMinute') || 720,
    closeMinute: num(formData, 'closeMinute') || 1440,
    active: bool(formData, 'active'),
  };

  if (id) {
    await prisma.branch.update({ where: { id }, data });
  } else {
    const branch = await prisma.branch.create({ data });
    // A new branch needs its own receipt series straight away.
    await prisma.receiptSeries.create({
      data: {
        branchId: branch.id,
        name: 'Sales Invoice',
        prefix: `SI${code}`,
        rangeStart: 1,
        rangeEnd: 100000,
        next: 1,
      },
    });
    await ensureAccounts();
  }

  await audit(user, {
    module: 'settings', action: id ? 'update_branch' : 'create_branch',
    entityType: 'Branch', entityId: id,
    summary: `${id ? 'Updated' : 'Opened'} branch "${name}"`,
    sensitive: true, after: data,
  });
  revalidatePath('/portal/settings/branches');
  return { ok: id ? 'Branch updated.' : 'Branch created with its own receipt series.' };
}

/* ------------------------------------------------------------- KPI & misc */

export async function saveKpiTargetsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePage('settings.edit');
  const periodKey = str(formData, 'periodKey');
  if (!periodKey) return { error: 'Choose the month.' };

  const keys = formData.getAll('kpiKey').map(String);
  const values = formData.getAll('kpiValue').map(String);
  const formats = formData.getAll('kpiFormat').map(String);

  for (const [i, key] of keys.entries()) {
    const raw = Number(values[i] ?? 0);
    if (!key || Number.isNaN(raw)) continue;
    const target = formats[i] === 'money' ? Math.round(raw * 100) : formats[i] === 'rating' ? Math.round(raw * 10) : Math.round(raw);
    await prisma.kpiTarget.upsert({
      where: { periodKey_key: { periodKey, key } },
      create: { periodKey, key, target },
      update: { target },
    });
  }

  await audit(user, {
    module: 'settings', action: 'update_kpi_targets', entityType: 'KpiTarget', entityId: periodKey,
    summary: `Set KPI targets for ${periodKey}`, sensitive: true,
  });
  revalidatePath('/portal/settings/kpi');
  revalidatePath('/portal/reports/kpi');
  return { ok: 'Targets saved.' };
}

export async function saveHolidayAction(formData: FormData) {
  const user = await requirePage('settings.edit');
  const dateKey = str(formData, 'date');
  const name = str(formData, 'name');
  if (!dateKey || !name) return;

  await prisma.holiday.upsert({
    where: { date: dateKeyToBusinessDate(dateKey) },
    create: {
      date: dateKeyToBusinessDate(dateKey),
      name,
      type: (str(formData, 'type') || 'REGULAR') as never,
    },
    update: { name, type: (str(formData, 'type') || 'REGULAR') as never },
  });
  await audit(user, {
    module: 'settings', action: 'save_holiday', entityType: 'Holiday',
    summary: `${name} on ${dateKey}`, sensitive: true,
  });
  revalidatePath('/portal/settings/payroll');
}

export async function savePermitAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePage('settings.view');
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!name) return { error: 'Name the permit or certificate.' };

  const data = {
    kind: (str(formData, 'employeeId') ? 'EMPLOYEE' : 'BUSINESS') as never,
    name,
    agency: str(formData, 'agency'),
    refNumber: str(formData, 'refNumber'),
    issueDate: str(formData, 'issueDate') ? dateKeyToBusinessDate(str(formData, 'issueDate')) : null,
    expiryDate: str(formData, 'expiryDate') ? dateKeyToBusinessDate(str(formData, 'expiryDate')) : null,
    fileUrl: str(formData, 'fileUrl'),
    notes: str(formData, 'notes'),
    employeeId: str(formData, 'employeeId') || null,
  };

  const permit = id
    ? await prisma.permit.update({ where: { id }, data })
    : await prisma.permit.create({ data });

  await audit(user, {
    module: 'settings', action: id ? 'update_permit' : 'create_permit',
    entityType: 'Permit', entityId: permit.id,
    summary: `${id ? 'Updated' : 'Added'} "${name}"`, sensitive: true,
  });
  revalidatePath('/portal/settings/permits');
  return { ok: 'Saved. Renewal reminders start 60 days before expiry.' };
}
