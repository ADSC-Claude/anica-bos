/**
 * Demo-ready seed. Running `npm run db:seed` produces a spa with a week of
 * real history: appointments, receipts, commissions, stock movements,
 * expenses and journal entries that all reconcile with each other.
 *
 * Safe to re-run: it clears business data first, then rebuilds.
 */
import { PrismaClient, type DiscountType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ACCOUNTS } from '../src/lib/accounting';
import { checkout } from '../src/lib/pos';
import { businessDate, manilaDateKey, addDaysToKey, manilaInstant, dateKeyToBusinessDate } from '../src/lib/datetime';
import { bookingReference } from '../src/lib/codes';
import { DEFAULT_SETTINGS } from '../src/lib/settings-defaults';

const prisma = new PrismaClient();

const P = (pesos: number) => Math.round(pesos * 100);

/** Deterministic PRNG so re-seeding produces the same demo numbers. */
let seedState = 20260730;
function rnd(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
}
function chance(p: number): boolean {
  return rnd() < p;
}

async function wipe() {
  // Order matters: children before parents.
  const tables = [
    'JournalLine', 'JournalEntry',
    'GiftCertificateRedemption', 'VoucherRedemption',
    'Commission', 'Payment', 'SaleDiscount', 'SaleLine',
    'LoyaltyTransaction', 'ClientPackageEntitlement', 'ClientPackage',
    'GiftCertificate', 'Voucher', 'VoucherBatch',
    'Sale', 'ReceiptSeries',
    'AppointmentService', 'Appointment',
    'ClientFieldValue', 'ClientFeedback', 'ClientFollowUp',
    'CorporateAccountClient', 'CorporateStatement', 'CorporatePayment', 'CorporateAccount',
    'EmailLog', 'ShiftNoteComment', 'ShiftNote', 'AnnouncementRead', 'Announcement',
    'DirectMessage', 'Notification',
    'Client', 'Partner',
    'StockTakeLine', 'StockTake', 'PurchaseOrderLine', 'PurchaseOrder',
    'SupplierPriceChange', 'SupplierItem', 'StockMovement', 'ServiceRecipe',
    'Item', 'ItemCategory', 'Unit', 'Supplier',
    'PettyCashTxn', 'PettyCashRequest', 'EodClosing', 'Expense', 'ExpenseCategory',
    'PayslipLine', 'Payslip', 'PayrollPeriod',
    'LoanPayment', 'EmployeeLoan', 'Attendance', 'EmployeeSchedule',
    'EmployeeCommissionRule', 'EmployeeSkill', 'IncentiveResult', 'IncentiveScheme',
    'Permit', 'PackageItem', 'Package', 'Promo', 'DiscountPreset',
    'Service', 'ServiceCategory', 'Resource',
    'LoginEvent', 'AuditLog', 'User', 'Employee',
    'Holiday', 'KpiTarget', 'ClientFieldDefinition', 'Setting', 'Account', 'Branch',
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  console.log('› Clearing existing data…');
  await wipe();

  // ------------------------------------------------------------------ branch
  console.log('› Branch, settings, chart of accounts…');
  const branch = await prisma.branch.create({
    data: {
      name: 'ANICA Quezon City',
      code: 'QC',
      address: '123 Kalayaan Avenue, Diliman, Quezon City, Metro Manila',
      contact: '+63 917 000 1234',
      openMinute: 720,
      closeMinute: 1440,
      isDefault: true,
    },
  });

  for (const a of ACCOUNTS) {
    await prisma.account.create({ data: { code: a.code, name: a.name, type: a.type } });
  }

  await prisma.setting.createMany({
    data: [
      { key: 'business.name', value: DEFAULT_SETTINGS['business.name'] },
      { key: 'business.address', value: branch.address },
      { key: 'business.contact', value: branch.contact },
      { key: 'business.tin', value: '456-789-012-00000' },
      { key: 'tax.regime', value: 'NON_VAT_8' },
      { key: 'booking.depositPercent', value: 30 },
      { key: 'booking.expiryMinutes', value: 120 },
      { key: 'booking.manualFallbackEnabled', value: false },
      { key: 'payroll.dailyAllowanceCents', value: P(200) },
      { key: 'payroll.commissionPercent', value: 25 },
      { key: 'pos.pettyCashFloatCents', value: P(3000) },
    ],
  });

  await prisma.receiptSeries.create({
    data: {
      branchId: branch.id,
      name: 'Non-VAT Sales Invoice',
      prefix: 'SI',
      rangeStart: 1,
      rangeEnd: 100000,
      next: 1,
      permitNumber: 'FP000000000000000 (sample — replace with your BIR ATP)',
    },
  });

  // ------------------------------------------------------------------ catalog
  console.log('› Service catalog…');
  const catMassage = await prisma.serviceCategory.create({ data: { name: 'Massage', sortRank: 1 } });
  const catBody = await prisma.serviceCategory.create({ data: { name: 'Body Treatments', sortRank: 2 } });
  const catAdd = await prisma.serviceCategory.create({ data: { name: 'Add-ons & Sauna', sortRank: 3 } });

  const serviceSpecs: {
    name: string; cat: string; minutes: number; price: number; rank: number; desc: string;
  }[] = [
    { name: 'Swedish Massage (60 min)', cat: catMassage.id, minutes: 60, price: 650, rank: 1, desc: 'Long, flowing strokes to ease everyday tension.' },
    { name: 'Swedish Massage (90 min)', cat: catMassage.id, minutes: 90, price: 900, rank: 2, desc: 'The full-body classic, with extra time on tight areas.' },
    { name: 'Shiatsu Massage (60 min)', cat: catMassage.id, minutes: 60, price: 700, rank: 3, desc: 'Japanese pressure-point work along the body’s meridians.' },
    { name: 'Shiatsu Massage (90 min)', cat: catMassage.id, minutes: 90, price: 950, rank: 4, desc: 'Deeper, unhurried pressure-point therapy.' },
    { name: 'Combination Massage (90 min)', cat: catMassage.id, minutes: 90, price: 980, rank: 5, desc: 'Swedish and Shiatsu blended to your preference.' },
    { name: 'Thai Massage (90 min)', cat: catMassage.id, minutes: 90, price: 1000, rank: 6, desc: 'Assisted stretching and rhythmic compression.' },
    { name: 'Hot Stone Massage (90 min)', cat: catMassage.id, minutes: 90, price: 1200, rank: 7, desc: 'Warm basalt stones melt deep muscle tension.' },
    { name: 'ANICA Signature Massage (90 min)', cat: catMassage.id, minutes: 90, price: 1250, rank: 8, desc: 'Our house blend of Swedish, Shiatsu and warm oil.' },
    { name: 'Foot Massage (30 min)', cat: catMassage.id, minutes: 30, price: 350, rank: 9, desc: 'Reflexology-inspired relief for tired feet.' },
    { name: 'Foot Massage (60 min)', cat: catMassage.id, minutes: 60, price: 600, rank: 10, desc: 'A full hour of reflexology from sole to calf.' },
    { name: 'Body Scrub (60 min)', cat: catBody.id, minutes: 60, price: 800, rank: 11, desc: 'Gentle exfoliation that leaves skin polished and soft.' },
    { name: 'Foot Spa (45 min)', cat: catBody.id, minutes: 45, price: 500, rank: 12, desc: 'Soak, scrub, and a soothing foot massage.' },
    { name: 'Sauna Session (30 min)', cat: catAdd.id, minutes: 30, price: 300, rank: 13, desc: 'Dry heat to loosen muscles before your treatment.' },
    { name: 'Hot Compress Add-on (15 min)', cat: catAdd.id, minutes: 15, price: 150, rank: 14, desc: 'Herbal hot compress for stubborn knots.' },
  ];

  const services = [];
  for (const spec of serviceSpecs) {
    services.push(
      await prisma.service.create({
        data: {
          name: spec.name,
          categoryId: spec.cat,
          durationMinutes: spec.minutes,
          priceCents: P(spec.price),
          description: spec.desc,
          sortRank: spec.rank,
        },
      }),
    );
  }
  const svcByName = new Map(services.map((s) => [s.name, s]));
  const signature = svcByName.get('ANICA Signature Massage (90 min)')!;

  // ---------------------------------------------------------------- resources
  const resources = [];
  for (const r of [
    { name: 'Room 1 (Couples)', type: 'ROOM' as const, rank: 1 },
    { name: 'Room 2 (Private)', type: 'ROOM' as const, rank: 2 },
    ...Array.from({ length: 6 }, (_, i) => ({
      name: `Bed ${i + 1}`,
      type: 'BED' as const,
      rank: 3 + i,
    })),
    { name: 'Sauna', type: 'SAUNA' as const, rank: 10 },
  ]) {
    resources.push(
      await prisma.resource.create({
        data: { branchId: branch.id, name: r.name, type: r.type, sortRank: r.rank },
      }),
    );
  }
  const beds = resources.filter((r) => r.type === 'BED');

  // ---------------------------------------------------------------- employees
  console.log('› Employees & users…');
  const therapistNames = [
    'Maricel Santos', 'Jenny Ramos', 'Liza Bautista', 'Ana Villanueva', 'Grace Delos Reyes',
    'Rowena Cruz', 'Melody Aquino', 'Cristina Flores', 'Divina Manalo',
  ];

  const therapists = [];
  for (const [i, name] of therapistNames.entries()) {
    const emp = await prisma.employee.create({
      data: {
        branchId: branch.id,
        name,
        employeeRole: 'THERAPIST',
        mobile: `0917${String(1000000 + i * 11111).slice(0, 7)}`,
        email: `${name.split(' ')[0].toLowerCase()}@anicaspa.ph`,
        address: 'Quezon City',
        emergencyName: 'Family contact',
        emergencyMobile: '0918 000 0000',
        hireDate: new Date(Date.UTC(2024, i % 12, 5)),
        sssNumber: `34-${1000000 + i}-1`,
        philhealthNumber: `12-${100000000 + i}-2`,
        pagibigNumber: `1234-5678-${1000 + i}`,
        tin: `123-456-${String(100 + i)}-000`,
        sssMonthlyCents: P(675),
        philhealthMonthlyCents: P(450),
        pagibigMonthlyCents: P(200),
        payType: 'DAILY_ALLOWANCE',
        payRateCents: P(200),
        payOwnerOnly: false,
      },
    });
    // Everyone can do the core massages; specialities are spread around.
    const core = services.filter((s) =>
      ['Swedish', 'Foot Massage', 'Foot Spa', 'Sauna'].some((k) => s.name.includes(k)),
    );
    const specials = pickN(
      services.filter((s) => !core.includes(s)),
      3 + Math.floor(rnd() * 4),
    );
    for (const s of [...core, ...specials]) {
      await prisma.employeeSkill.create({ data: { employeeId: emp.id, serviceId: s.id } });
    }
    for (let d = 0; d < 7; d++) {
      await prisma.employeeSchedule.create({
        data: {
          employeeId: emp.id,
          dayOfWeek: d,
          isDayOff: d === (i % 7),
          startMinute: 720,
          endMinute: 1440,
        },
      });
    }
    therapists.push(emp);
  }

  const managerEmp = await prisma.employee.create({
    data: {
      branchId: branch.id, name: 'Katrina Lopez', employeeRole: 'MANAGER',
      mobile: '0917 555 0101', email: 'manager@anicaspa.ph', address: 'Quezon City',
      hireDate: new Date(Date.UTC(2023, 5, 1)),
      sssNumber: '34-9000001-1', philhealthNumber: '12-900000001-2',
      pagibigNumber: '1234-5678-9001', tin: '987-654-321-000',
      sssMonthlyCents: P(1350), philhealthMonthlyCents: P(900), pagibigMonthlyCents: P(200),
      payType: 'FIXED_SALARY', payRateCents: P(18000), payOwnerOnly: true,
    },
  });
  const receptionEmp = await prisma.employee.create({
    data: {
      branchId: branch.id, name: 'Joy Mendoza', employeeRole: 'RECEPTIONIST',
      mobile: '0917 555 0102', email: 'reception@anicaspa.ph', address: 'Quezon City',
      hireDate: new Date(Date.UTC(2024, 1, 15)),
      sssNumber: '34-9000002-1', philhealthNumber: '12-900000002-2',
      pagibigNumber: '1234-5678-9002', tin: '987-654-322-000',
      sssMonthlyCents: P(900), philhealthMonthlyCents: P(600), pagibigMonthlyCents: P(200),
      payType: 'DAILY_RATE', payRateCents: P(650), payOwnerOnly: true,
    },
  });
  const ownerEmp = await prisma.employee.create({
    data: {
      branchId: branch.id, name: 'Angelica Corporal', employeeRole: 'OWNER',
      mobile: '0917 555 0100', email: 'owner@anicaspa.ph',
      hireDate: new Date(Date.UTC(2023, 0, 1)),
      payType: 'FIXED_SALARY', payRateCents: 0, payOwnerOnly: true,
    },
  });

  for (const [d, off] of [[0, false], [1, true], [2, false], [3, false], [4, false], [5, false], [6, false]] as [number, boolean][]) {
    await prisma.employeeSchedule.create({ data: { employeeId: receptionEmp.id, dayOfWeek: d, isDayOff: off } });
    await prisma.employeeSchedule.create({ data: { employeeId: managerEmp.id, dayOfWeek: d, isDayOff: d === 0 } });
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 11);
  const owner = await prisma.user.create({
    data: {
      email: 'owner@anicaspa.ph', name: 'Angelica Corporal', role: 'OWNER',
      passwordHash: hash('anica-owner'), branchId: branch.id, employeeId: ownerEmp.id,
      mustChangePassword: true, approvalPinHash: hash('2468'),
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: 'manager@anicaspa.ph', name: 'Katrina Lopez', role: 'ADMIN',
      passwordHash: hash('anica-admin'), branchId: branch.id, employeeId: managerEmp.id,
      mustChangePassword: true, approvalPinHash: hash('1357'),
    },
  });
  const reception = await prisma.user.create({
    data: {
      email: 'reception@anicaspa.ph', name: 'Joy Mendoza', role: 'RECEPTIONIST',
      passwordHash: hash('anica-front'), branchId: branch.id, employeeId: receptionEmp.id,
      mustChangePassword: true,
    },
  });

  // ------------------------------------------------------- intake definitions
  console.log('› Client intake form definitions…');
  const intake: {
    key: string; label: string; section: 'PROFILE' | 'MEDICAL'; type: 'TEXT' | 'TEXTAREA' | 'BOOLEAN' | 'SELECT' | 'MULTISELECT';
    options?: string[]; online: boolean; alert?: string[]; rank: number; help?: string;
  }[] = [
    { key: 'pressure_preference', label: 'Preferred pressure', section: 'PROFILE', type: 'SELECT', options: ['Light', 'Medium', 'Firm', 'Deep'], online: true, rank: 1 },
    { key: 'how_heard', label: 'How did you hear about us?', section: 'PROFILE', type: 'SELECT', options: ['Facebook', 'Walk-by', 'Friend/Referral', 'Hotel/Partner', 'Other'], online: true, rank: 2 },
    { key: 'hypertension', label: 'High blood pressure / hypertension', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 10 },
    { key: 'heart_condition', label: 'Heart condition', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 11 },
    { key: 'diabetes', label: 'Diabetes', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 12 },
    { key: 'pregnancy', label: 'Pregnant or recently gave birth', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 13 },
    { key: 'recent_surgery', label: 'Recent surgery or injury', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 14 },
    { key: 'skin_condition', label: 'Skin condition or open wounds', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 15 },
    { key: 'varicose_veins', label: 'Varicose veins', section: 'MEDICAL', type: 'BOOLEAN', online: true, alert: ['true'], rank: 16 },
    { key: 'allergies', label: 'Allergies (oils, scents, nuts, etc.)', section: 'MEDICAL', type: 'TEXT', online: true, rank: 17, help: 'Tell us anything we should avoid using on you.' },
    { key: 'medications', label: 'Current medications', section: 'MEDICAL', type: 'TEXT', online: false, rank: 18 },
    { key: 'other_conditions', label: 'Other conditions or notes for your therapist', section: 'MEDICAL', type: 'TEXTAREA', online: true, rank: 19 },
  ];
  const defs = [];
  for (const f of intake) {
    defs.push(
      await prisma.clientFieldDefinition.create({
        data: {
          key: f.key, label: f.label, section: f.section, type: f.type,
          options: f.options ?? [], showOnline: f.online, alertValues: f.alert ?? [],
          sortRank: f.rank, helpText: f.help ?? '',
        },
      }),
    );
  }
  const defByKey = new Map(defs.map((d) => [d.key, d]));

  // ------------------------------------------------------------- inventory
  console.log('› Inventory, suppliers…');
  const unitMl = await prisma.unit.create({ data: { name: 'ml' } });
  const unitPc = await prisma.unit.create({ data: { name: 'pc' } });
  const unitPack = await prisma.unit.create({ data: { name: 'pack' } });
  const unitKg = await prisma.unit.create({ data: { name: 'kg' } });

  const catConsumable = await prisma.itemCategory.create({ data: { name: 'Consumables' } });
  const catLinen = await prisma.itemCategory.create({ data: { name: 'Linen & Towels' } });
  const catRetail = await prisma.itemCategory.create({ data: { name: 'Retail Products' } });
  const catSupply = await prisma.itemCategory.create({ data: { name: 'Supplies' } });

  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { name: 'Herbal Essence Trading', contactPerson: 'Mr. Dizon', mobile: '0918 111 2222', email: 'sales@herbalessence.ph', address: 'Marikina City', paymentTerms: '30 days' } }),
    prisma.supplier.create({ data: { name: 'Metro Linen Supply', contactPerson: 'Ms. Ramos', mobile: '0919 333 4444', email: 'orders@metrolinen.ph', address: 'Caloocan City', paymentTerms: 'COD' } }),
    prisma.supplier.create({ data: { name: 'QC Wellness Distributors', contactPerson: 'Mr. Tan', mobile: '0917 555 6666', email: 'hello@qcwd.ph', address: 'Quezon City', paymentTerms: '15 days' } }),
  ]);

  const itemSpecs = [
    { name: 'Massage Oil — Lavender', cat: catConsumable.id, unit: unitMl.id, cost: 0.55, retail: 0, stock: 4200, reorder: 1500, sup: 0 },
    { name: 'Massage Oil — Eucalyptus', cat: catConsumable.id, unit: unitMl.id, cost: 0.6, retail: 0, stock: 2800, reorder: 1500, sup: 0 },
    { name: 'Massage Lotion — Unscented', cat: catConsumable.id, unit: unitMl.id, cost: 0.4, retail: 0, stock: 900, reorder: 1200, sup: 0 },
    { name: 'Body Scrub Salt', cat: catConsumable.id, unit: unitKg.id, cost: 180, retail: 0, stock: 12, reorder: 5, sup: 0 },
    { name: 'Foot Spa Soak Solution', cat: catConsumable.id, unit: unitMl.id, cost: 0.3, retail: 0, stock: 3000, reorder: 1000, sup: 0 },
    { name: 'Hot Stone Set (replacement)', cat: catSupply.id, unit: unitPc.id, cost: 950, retail: 0, stock: 3, reorder: 1, sup: 2 },
    { name: 'Bath Towel — Large', cat: catLinen.id, unit: unitPc.id, cost: 220, retail: 0, stock: 48, reorder: 24, sup: 1 },
    { name: 'Face Towel', cat: catLinen.id, unit: unitPc.id, cost: 65, retail: 0, stock: 90, reorder: 40, sup: 1 },
    { name: 'Disposable Slippers', cat: catSupply.id, unit: unitPack.id, cost: 320, retail: 0, stock: 8, reorder: 6, sup: 1 },
    { name: 'Disposable Underwear', cat: catSupply.id, unit: unitPack.id, cost: 280, retail: 0, stock: 5, reorder: 6, sup: 1 },
    { name: 'Alcohol 70% (1L)', cat: catSupply.id, unit: unitPc.id, cost: 145, retail: 0, stock: 10, reorder: 6, sup: 2 },
    { name: 'Bottled Water (case)', cat: catSupply.id, unit: unitPack.id, cost: 210, retail: 0, stock: 6, reorder: 4, sup: 2 },
    { name: 'ANICA Massage Oil 100ml (retail)', cat: catRetail.id, unit: unitPc.id, cost: 180, retail: 450, stock: 24, reorder: 10, sup: 0, sell: true },
    { name: 'ANICA Herbal Balm 30g (retail)', cat: catRetail.id, unit: unitPc.id, cost: 95, retail: 250, stock: 30, reorder: 12, sup: 0, sell: true },
    { name: 'ANICA Ginger Tea Sachets (retail)', cat: catRetail.id, unit: unitPack.id, cost: 120, retail: 300, stock: 18, reorder: 8, sup: 2, sell: true },
  ];

  const items = [];
  for (const spec of itemSpecs) {
    const item = await prisma.item.create({
      data: {
        branchId: branch.id, name: spec.name, categoryId: spec.cat, unitId: spec.unit,
        costCents: P(spec.cost), retailPriceCents: P(spec.retail), sellable: spec.sell ?? false,
        stockQty: spec.stock, reorderLevel: spec.reorder, supplierId: suppliers[spec.sup].id,
      },
    });
    await prisma.supplierItem.create({
      data: { supplierId: suppliers[spec.sup].id, itemId: item.id, priceCents: P(spec.cost) },
    });
    await prisma.stockMovement.create({
      data: {
        branchId: branch.id, itemId: item.id, type: 'ADJUSTMENT', quantity: spec.stock,
        unitCostCents: P(spec.cost), reason: 'Opening balance', userName: 'seed',
      },
    });
    items.push(item);
  }
  const itemByName = new Map(items.map((i) => [i.name, i]));

  // consumption recipes
  const recipe = async (serviceName: string, itemName: string, qty: number) => {
    const svc = svcByName.get(serviceName);
    const item = itemByName.get(itemName);
    if (svc && item) {
      await prisma.serviceRecipe.create({ data: { serviceId: svc.id, itemId: item.id, quantity: qty } });
    }
  };
  for (const name of serviceSpecs.filter((s) => s.name.includes('Massage')).map((s) => s.name)) {
    await recipe(name, 'Massage Oil — Lavender', name.includes('90') ? 45 : 30);
  }
  await recipe('Body Scrub (60 min)', 'Body Scrub Salt', 0.25);
  await recipe('Foot Spa (45 min)', 'Foot Spa Soak Solution', 120);

  // -------------------------------------------------------------- discounts
  console.log('› Discount presets, promos, packages…');
  const presetMember = await prisma.discountPreset.create({
    data: { name: 'Member 10%', type: 'PERCENT', value: 10, stackable: true, membersOnly: true, sortRank: 1 },
  });
  await prisma.discountPreset.create({
    data: { name: 'PWD 20%', type: 'PERCENT', value: 20, stackable: false, requiresId: true, sortRank: 2 },
  });
  await prisma.discountPreset.create({
    data: { name: 'Senior Citizen 20%', type: 'PERCENT', value: 20, stackable: false, requiresId: true, sortRank: 3 },
  });
  const presetPromo = await prisma.discountPreset.create({
    data: { name: 'Weekday Promo 15%', type: 'PERCENT', value: 15, stackable: true, sortRank: 4 },
  });
  await prisma.discountPreset.create({
    data: {
      name: 'Employee Rate 50%', type: 'PERCENT', value: 50, stackable: false,
      isEmployeeRate: true, monthlyUsageLimit: 2, familyIncluded: true, sortRank: 5,
    },
  });

  const today = manilaDateKey();
  await prisma.promo.create({
    data: {
      name: 'Weekday Wind-Down — 15% off',
      description: 'Every Monday to Thursday, 12nn–4pm. All massages 15% off.',
      type: 'PERCENT', value: 15,
      startDate: dateKeyToBusinessDate(addDaysToKey(today, -30)),
      endDate: dateKeyToBusinessDate(addDaysToKey(today, 60)),
      code: 'WEEKDAY15',
    },
  });
  await prisma.promo.create({
    data: {
      name: 'Bring-a-Friend Foot Spa',
      description: 'Book two Foot Spa sessions together and save ₱200.',
      type: 'FIXED', value: P(200),
      startDate: dateKeyToBusinessDate(addDaysToKey(today, -10)),
      endDate: dateKeyToBusinessDate(addDaysToKey(today, 45)),
      serviceIds: [svcByName.get('Foot Spa (45 min)')!.id],
    },
  });

  const pkgTen = await prisma.package.create({
    data: {
      name: '10 Swedish Massages (pay for 8)',
      type: 'SESSION_PACKAGE',
      description: 'Ten 60-minute Swedish massages for the price of eight. Valid one year.',
      priceCents: P(5200), validityDays: 365, showOnLanding: true,
      items: { create: [{ serviceId: svcByName.get('Swedish Massage (60 min)')!.id, sessions: 10 }] },
    },
  });
  const pkgMembership = await prisma.package.create({
    data: {
      name: 'ANICA Wellness Membership (1 year)',
      type: 'MEMBERSHIP',
      description: '10% off every visit for a year, plus a free ANICA Signature Massage during your birthday month.',
      priceCents: P(3500), validityDays: 365, memberDiscountPercent: 10,
      birthdayPerkServiceId: signature.id, showOnLanding: true,
    },
  });
  await prisma.setting.create({
    data: { key: 'membership.birthdayPerkServiceId', value: signature.id },
  });

  // ---------------------------------------------------------------- expenses
  const expCats = await Promise.all([
    prisma.expenseCategory.create({ data: { name: 'Rent', accountCode: '6100' } }),
    prisma.expenseCategory.create({ data: { name: 'Utilities', accountCode: '6110' } }),
    prisma.expenseCategory.create({ data: { name: 'Salaries & Wages', accountCode: '6000' } }),
    prisma.expenseCategory.create({ data: { name: 'Supplies', accountCode: '6120' } }),
    prisma.expenseCategory.create({ data: { name: 'Marketing', accountCode: '6130' } }),
    prisma.expenseCategory.create({ data: { name: 'Miscellaneous', accountCode: '6900' } }),
    prisma.expenseCategory.create({ data: { name: 'Inventory Purchases', accountCode: '1200', capitalized: true } }),
  ]);

  // --------------------------------------------------- corporate & partners
  const corp = await prisma.corporateAccount.create({
    data: {
      name: 'Northgate BPO Solutions Inc.', tin: '005-123-456-00000',
      billingAddress: 'Eastwood City, Quezon City', contactPerson: 'HR — Ms. Perez',
      contactMobile: '0917 222 3333', contactEmail: 'hr@northgatebpo.ph',
      discountType: 'PERCENT', discountValue: 10, creditLimitCents: P(50000), paymentTermsDays: 30,
    },
  });
  const partnerHotel = await prisma.partner.create({
    data: {
      name: 'Casa Diliman Hotel', type: 'hotel', contactPerson: 'Front Office',
      contactMobile: '0917 444 5555', feeType: 'PERCENT', feeValue: 10,
      guestDiscountType: 'PERCENT', guestDiscountValue: 5, promoCode: 'CASADILIMAN',
      terms: '10% referral fee on referred guest bills; guests get 5% off.',
    },
  });
  await prisma.partner.create({
    data: {
      name: 'FitHub Katipunan', type: 'gym', contactPerson: 'Coach Rey',
      feeType: 'FIXED', feeValue: P(100), guestDiscountType: 'PERCENT', guestDiscountValue: 10,
      promoCode: 'FITHUB10', terms: '₱100 per referred client; members get 10% off.',
    },
  });

  // ------------------------------------------------------------------ clients
  console.log('› Clients…');
  const firstNames = ['Maria', 'Juan', 'Andrea', 'Paolo', 'Carla', 'Miguel', 'Sofia', 'Rafael', 'Beatriz', 'Diego', 'Isabel', 'Marco', 'Camille', 'Enrique', 'Patricia', 'Vincent', 'Lourdes', 'Nathan', 'Rowena', 'Alfonso'];
  const lastNames = ['Reyes', 'Garcia', 'Torres', 'Mendoza', 'Castillo', 'Navarro', 'Domingo', 'Salazar', 'Ocampo', 'Rivera', 'Guevarra', 'Pascual', 'Lim', 'Uy', 'Fernandez', 'Aguilar', 'Bautista', 'Cordero', 'Espino', 'Panganiban'];
  const cities = ['Quezon City', 'Marikina City', 'San Juan City', 'Pasig City', 'Mandaluyong City', 'Caloocan City'];

  const clients = [];
  for (let i = 0; i < 20; i++) {
    const name = `${firstNames[i]} ${lastNames[i]}`;
    const bMonth = Math.floor(rnd() * 12);
    const client = await prisma.client.create({
      data: {
        branchId: branch.id,
        name,
        mobile: `09${String(170000000 + i * 1234567).slice(0, 9)}`,
        email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@example.com`,
        birthday: new Date(Date.UTC(1980 + (i % 25), bMonth, 1 + Math.floor(rnd() * 27))),
        addressCity: pick(cities),
        addressLine: `${10 + i} Sampaguita St.`,
        barangay: `Barangay ${1 + (i % 40)}`,
        tags: chance(0.3) ? ['regular'] : [],
        consentGiven: true,
        consentAt: new Date(),
        medicalUpdatedAt: new Date(),
      },
    });
    // medical answers
    for (const def of defs.filter((d) => d.section === 'MEDICAL')) {
      let value: unknown = def.type === 'BOOLEAN' ? chance(0.12) : '';
      if (def.key === 'allergies' && chance(0.2)) value = 'Nuts / almond oil';
      if (def.key === 'other_conditions' && chance(0.15)) value = 'Prefers no pressure on lower back.';
      if (value === '' || value === false) continue;
      await prisma.clientFieldValue.create({
        data: { clientId: client.id, definitionId: def.id, value: value as never },
      });
    }
    await prisma.clientFieldValue.create({
      data: {
        clientId: client.id,
        definitionId: defByKey.get('pressure_preference')!.id,
        value: pick(['Light', 'Medium', 'Firm', 'Deep']) as never,
      },
    });
    clients.push(client);
  }
  // Link a few clients to the corporate account.
  for (const c of clients.slice(0, 4)) {
    await prisma.corporateAccountClient.create({ data: { accountId: corp.id, clientId: c.id } });
  }

  // Give three clients live entitlements so the POS demo has something to redeem.
  const memberClient = clients[0];
  await prisma.clientPackage.create({
    data: {
      clientId: memberClient.id, packageId: pkgMembership.id,
      expiresAt: new Date(Date.now() + 20 * 86_400_000), // expiring soon → alert demo
    },
  });
  const packClient = clients[1];
  const cp = await prisma.clientPackage.create({
    data: {
      clientId: packClient.id, packageId: pkgTen.id,
      expiresAt: new Date(Date.now() + 300 * 86_400_000),
    },
  });
  await prisma.clientPackageEntitlement.create({
    data: {
      clientPackageId: cp.id,
      serviceId: svcByName.get('Swedish Massage (60 min)')!.id,
      totalSessions: 10, usedSessions: 3,
    },
  });

  // -------------------------------------------------- a week of operations
  console.log('› One week of appointments, sales, attendance…');
  const days = Array.from({ length: 8 }, (_, i) => addDaysToKey(today, i - 7)); // last 7 days + today

  for (const dayKey of days) {
    const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
    const onDuty = therapists.filter((_, idx) => idx % 7 !== dow % 7).slice(0, 6);

    // attendance (time-in order defines the rotation queue)
    for (const [rank, t] of onDuty.entries()) {
      const timeIn = 720 + rank * 5 + (chance(0.2) ? 20 : 0);
      const late = timeIn > 735;
      await prisma.attendance.create({
        data: {
          branchId: branch.id, employeeId: t.id,
          workDate: dateKeyToBusinessDate(dayKey),
          timeIn: manilaInstant(dayKey, timeIn),
          timeOut: dayKey === today ? null : manilaInstant(dayKey, 1440),
          isLate: late, lateMinutes: late ? timeIn - 735 : 0,
          rotationRank: rank + 1, recordedBy: reception.name,
        },
      });
    }
    for (const emp of [receptionEmp, managerEmp]) {
      if (dow === 0 && emp.id === managerEmp.id) continue;
      await prisma.attendance.create({
        data: {
          branchId: branch.id, employeeId: emp.id,
          workDate: dateKeyToBusinessDate(dayKey),
          timeIn: manilaInstant(dayKey, 700),
          timeOut: dayKey === today ? null : manilaInstant(dayKey, 1450),
          rotationRank: 0, recordedBy: reception.name,
        },
      });
    }

    const bookings = dayKey === today ? 6 : 8 + Math.floor(rnd() * 5);
    for (let b = 0; b < bookings; b++) {
      const client = pick(clients);
      const therapist = pick(onDuty);
      const eligible = services.filter((s) => s.durationMinutes <= 90);
      const service = pick(eligible);
      const startMinute = 720 + Math.floor(rnd() * 10) * 60;
      if (startMinute + service.durationMinutes > 1440) continue;
      const resource = pick(beds);
      const online = chance(0.4);
      const isFuture = dayKey === today && startMinute > 900;

      const depositCents = online ? Math.round(service.priceCents * 0.3) : 0;
      const appt = await prisma.appointment.create({
        data: {
          branchId: branch.id,
          reference: bookingReference(),
          clientId: client.id,
          resourceId: resource.id,
          startAt: manilaInstant(dayKey, startMinute),
          endAt: manilaInstant(dayKey, startMinute + service.durationMinutes),
          status: isFuture ? (online ? 'CONFIRMED' : 'CONFIRMED') : 'COMPLETED',
          source: online ? 'ONLINE' : chance(0.5) ? 'WALK_IN' : 'PHONE',
          partnerId: chance(0.1) ? partnerHotel.id : null,
          depositStatus: online ? 'PAID' : 'NONE',
          depositAmountCents: depositCents,
          depositPaidCents: depositCents,
          depositMethod: online ? 'gcash' : '',
          depositReference: online ? `pay_demo_${Math.floor(rnd() * 1e8)}` : '',
          completedAt: isFuture ? null : manilaInstant(dayKey, startMinute + service.durationMinutes),
          services: {
            create: {
              serviceId: service.id,
              employeeId: therapist.id,
              priceCents: service.priceCents,
              durationMinutes: service.durationMinutes,
            },
          },
        },
      });

      if (isFuture) continue;

      // Check out the completed appointment through the real POS engine.
      const discounts: { presetId?: string; label: string; type: DiscountType; value: number }[] = [];
      if (chance(0.18) && dow >= 1 && dow <= 4) {
        discounts.push({ presetId: presetPromo.id, label: 'Weekday Promo 15%', type: 'PERCENT', value: 15 });
      }
      if (client.id === memberClient.id) {
        discounts.push({ presetId: presetMember.id, label: 'Member 10%', type: 'PERCENT', value: 10 });
      }

      const gross = service.priceCents;
      const afterDiscount = discounts.reduce(
        (acc, d) => acc - (d.type === 'PERCENT' ? Math.round(acc * d.value / 100) : d.value),
        gross,
      );
      const tip = chance(0.35) ? P(pick([50, 100, 150])) : 0;
      const due = afterDiscount + tip - depositCents;

      const method = pick(['CASH', 'CASH', 'GCASH', 'BANK_TRANSFER'] as const);
      const payments =
        method === 'CASH'
          ? [{ method, amountCents: Math.ceil(due / 10000) * 10000 }] // rounded-up cash → change
          : [{ method, amountCents: due, reference: `REF${Math.floor(rnd() * 1e6)}` }];

      const retail = chance(0.15) ? pick(items.filter((i) => i.sellable)) : null;

      try {
        await checkout({
          branchId: branch.id,
          cashierId: reception.id,
          cashierName: reception.name,
          clientId: client.id,
          appointmentId: appt.id,
          partnerId: appt.partnerId,
          businessDateKey: dayKey,
          tipCents: tip,
          discounts,
          lines: [
            {
              type: 'SERVICE',
              serviceId: service.id,
              employeeId: therapist.id,
              quantity: 1,
            },
            ...(retail
              ? [{ type: 'PRODUCT' as const, itemId: retail.id, quantity: 1 }]
              : []),
          ],
          payments: retail
            ? [{ method: 'CASH' as const, amountCents: due + retail.retailPriceCents + 10000 }]
            : payments,
        });
      } catch (err) {
        console.warn(`  · skipped a demo sale on ${dayKey}: ${(err as Error).message}`);
      }

      if (chance(0.25)) {
        await prisma.clientFeedback.create({
          data: {
            clientId: client.id, employeeId: therapist.id,
            rating: pick([5, 5, 5, 4, 4, 3]),
            comment: pick(['Very relaxing, thank you!', 'Great pressure.', 'Room was a bit cold.', 'Will come back.']),
            recordedBy: reception.name,
          },
        });
      }
    }
  }

  // A couple of pending online bookings for tomorrow, to demo the queue.
  const tomorrow = addDaysToKey(today, 1);
  for (let i = 0; i < 2; i++) {
    const client = pick(clients);
    const service = pick(services.filter((s) => s.durationMinutes === 60));
    const start = 780 + i * 120;
    await prisma.appointment.create({
      data: {
        branchId: branch.id,
        reference: bookingReference(),
        clientId: client.id,
        startAt: manilaInstant(tomorrow, start),
        endAt: manilaInstant(tomorrow, start + service.durationMinutes),
        status: 'PENDING',
        source: 'ONLINE',
        depositStatus: 'AWAITING_PAYMENT',
        depositAmountCents: Math.round(service.priceCents * 0.3),
        expiresAt: new Date(Date.now() + 90 * 60_000),
        services: {
          create: {
            serviceId: service.id,
            priceCents: service.priceCents,
            durationMinutes: service.durationMinutes,
          },
        },
      },
    });
  }

  // ------------------------------------------------------------- expenses
  console.log('› Expenses, petty cash, purchase order…');
  const expenseSeed: [string, number, number, string][] = [
    ['Rent', 35000, -6, 'Monthly rent — Kalayaan branch'],
    ['Utilities', 8600, -5, 'Meralco electricity'],
    ['Utilities', 1900, -5, 'Maynilad water'],
    ['Supplies', 4200, -4, 'Cleaning supplies restock'],
    ['Marketing', 3000, -3, 'Facebook boosted post'],
    ['Miscellaneous', 1500, -2, 'Aircon cleaning'],
  ];
  for (const [catName, amount, offset, description] of expenseSeed) {
    const cat = expCats.find((c) => c.name === catName)!;
    const dateKey = addDaysToKey(today, offset);
    const expense = await prisma.expense.create({
      data: {
        branchId: branch.id, categoryId: cat.id, description, amountCents: P(amount),
        expenseDate: dateKeyToBusinessDate(dateKey), method: 'CASH', status: 'APPROVED',
        submittedById: reception.id, approvedById: owner.id, approvedAt: new Date(),
      },
    });
    const account = await prisma.account.findUnique({ where: { code: cat.accountCode } });
    const cash = await prisma.account.findUnique({ where: { code: '1000' } });
    await prisma.journalEntry.create({
      data: {
        branchId: branch.id, source: 'CASH_DISBURSEMENTS',
        entryDate: dateKeyToBusinessDate(dateKey), reference: `EXP-${expense.id.slice(-6)}`,
        memo: description, expenseId: expense.id, createdBy: 'seed',
        lines: {
          create: [
            { accountId: account!.id, debitCents: P(amount) },
            { accountId: cash!.id, creditCents: P(amount) },
          ],
        },
      },
    });
  }
  // One pending expense awaiting the Owner's approval.
  await prisma.expense.create({
    data: {
      branchId: branch.id, categoryId: expCats.find((c) => c.name === 'Supplies')!.id,
      description: 'Emergency towel restock (needs approval)', amountCents: P(2400),
      expenseDate: businessDate(), method: 'CASH', status: 'PENDING',
      submittedById: reception.id,
    },
  });

  // petty cash
  let pettyBalance = P(3000);
  await prisma.pettyCashTxn.create({
    data: {
      branchId: branch.id, direction: 'IN', amountCents: pettyBalance,
      description: 'Opening float', balanceAfterCents: pettyBalance,
      businessDate: dateKeyToBusinessDate(addDaysToKey(today, -7)),
      recordedById: owner.id, recordedByName: owner.name,
    },
  });
  for (const [offset, amount, desc] of [[-5, 350, 'Water delivery'], [-3, 480, 'Supplies run — tissue & soap'], [-1, 220, 'Grab delivery of oils']] as [number, number, string][]) {
    pettyBalance -= P(amount);
    await prisma.pettyCashTxn.create({
      data: {
        branchId: branch.id, direction: 'OUT', amountCents: P(amount), description: desc,
        balanceAfterCents: pettyBalance, businessDate: dateKeyToBusinessDate(addDaysToKey(today, offset)),
        recordedById: reception.id, recordedByName: reception.name,
      },
    });
  }

  // purchase order awaiting approval
  const lowItem = itemByName.get('Massage Lotion — Unscented')!;
  await prisma.purchaseOrder.create({
    data: {
      branchId: branch.id, number: 'PO-000001', supplierId: suppliers[0].id, status: 'DRAFT',
      totalCents: P(2000), notes: 'Auto-suggested from reorder level breach.', createdBy: reception.name,
      lines: { create: [{ itemId: lowItem.id, quantity: 5000, unitCostCents: P(0.4) }] },
    },
  });

  // ------------------------------------------------------------ compliance
  console.log('› Permits, holidays, KPI targets, incentives…');
  const permitSeed: [string, string, string, number][] = [
    ["Mayor's / Business Permit", 'Quezon City Business Permits Office', 'QC-2026-004512', 150],
    ['Barangay Clearance', 'Barangay Diliman', 'BRGY-2026-0781', 120],
    ['BIR Certificate of Registration (Form 2303)', 'BIR RDO 39 — South QC', '9RC0000123456', 3650],
    ['Sanitary Permit', 'QC Health Department', 'SAN-2026-2210', 45],
    ['Fire Safety Inspection Certificate', 'Bureau of Fire Protection — QC', 'FSIC-2026-8890', 22],
    ['DTI Business Name Registration', 'DTI NCR', 'DTI-5566778', 400],
  ];
  for (const [name, agency, ref, daysAhead] of permitSeed) {
    await prisma.permit.create({
      data: {
        kind: 'BUSINESS', name, agency, refNumber: ref,
        issueDate: new Date(Date.now() - 300 * 86_400_000),
        expiryDate: new Date(Date.now() + daysAhead * 86_400_000),
      },
    });
  }
  for (const t of therapists.slice(0, 5)) {
    await prisma.permit.create({
      data: {
        kind: 'EMPLOYEE', name: 'TESDA Massage Therapy NC II', agency: 'TESDA',
        refNumber: `NCII-${Math.floor(rnd() * 900000 + 100000)}`, employeeId: t.id,
        issueDate: new Date(Date.now() - 500 * 86_400_000),
        expiryDate: new Date(Date.now() + (60 + Math.floor(rnd() * 600)) * 86_400_000),
      },
    });
  }

  const year = new Date().getUTCFullYear();
  const holidays: [number, number, string, 'REGULAR' | 'SPECIAL'][] = [
    [1, 1, "New Year's Day", 'REGULAR'],
    [4, 9, 'Araw ng Kagitingan', 'REGULAR'],
    [5, 1, 'Labor Day', 'REGULAR'],
    [6, 12, 'Independence Day', 'REGULAR'],
    [8, 21, 'Ninoy Aquino Day', 'SPECIAL'],
    [8, 31, 'National Heroes Day', 'REGULAR'],
    [11, 1, "All Saints' Day", 'SPECIAL'],
    [11, 30, 'Bonifacio Day', 'REGULAR'],
    [12, 8, 'Feast of the Immaculate Conception', 'SPECIAL'],
    [12, 25, 'Christmas Day', 'REGULAR'],
    [12, 30, 'Rizal Day', 'REGULAR'],
    [12, 31, "New Year's Eve", 'SPECIAL'],
  ];
  for (const [m, d, name, type] of holidays) {
    await prisma.holiday.create({
      data: { date: new Date(Date.UTC(year, m - 1, d)), name, type },
    });
  }

  const monthKey = today.slice(0, 7);
  const kpiTargets: [string, number][] = [
    ['revenue', P(450000)],
    ['clientsServed', 320],
    ['averageSale', P(1100)],
    ['retentionRate', 60],
    ['noShowRate', 5],
    ['therapistUtilization', 65],
    ['roomOccupancy', 55],
    ['activeMemberships', 40],
    ['membershipRenewalRate', 70],
    ['averageRating', 45], // 4.5 stars, stored ×10
  ];
  for (const [key, target] of kpiTargets) {
    await prisma.kpiTarget.create({ data: { periodKey: monthKey, key, target } });
  }

  await prisma.incentiveScheme.create({
    data: {
      name: 'Therapist of the Month', targetRole: 'THERAPIST', formula: 'FIXED_AMOUNT',
      value: P(2000), metric: 'revenue', period: 'MONTHLY',
      note: 'Highest revenue generated for the month. Released manually by the Owner.',
    },
  });
  await prisma.incentiveScheme.create({
    data: {
      name: 'Manager Monthly Target Bonus', targetRole: 'MANAGER', formula: 'PERCENT_OF_TARGET',
      value: 5, targetValue: P(450000), metric: 'revenue', period: 'MONTHLY',
      note: '5% of the monthly revenue target, pro-rated by achievement.',
    },
  });
  await prisma.incentiveScheme.create({
    data: {
      name: 'Receptionist Attendance & Conversion', targetRole: 'RECEPTIONIST',
      formula: 'FIXED_AMOUNT', value: P(1500), metric: 'attendance', period: 'MONTHLY',
      note: 'Perfect attendance plus online booking conversion above target.',
    },
  });

  // ------------------------------------------------------------------ comms
  await prisma.announcement.create({
    data: {
      branchId: branch.id, authorId: owner.id,
      title: 'New Weekday Wind-Down promo is live',
      body: 'From today, all massages are 15% off Mondays to Thursdays, 12nn–4pm. Please mention it to walk-ins and tap the "Weekday Promo 15%" button at checkout.',
    },
  });
  await prisma.shiftNote.create({
    data: {
      branchId: branch.id, noteDate: businessDate(), authorId: reception.id,
      body: 'Bed 3 squeaks — maintenance called, coming Thursday. Please use Bed 5 for hot stone in the meantime.',
    },
  });
  await prisma.directMessage.create({
    data: { fromUserId: owner.id, toUserId: reception.id, body: 'Great job on yesterday\'s numbers, Joy! Please double-check the petty cash count tonight.' },
  });

  console.log('\n✓ Seed complete.\n');
  const [saleCount, apptCount, clientCount] = await Promise.all([
    prisma.sale.count(),
    prisma.appointment.count(),
    prisma.client.count(),
  ]);
  console.log(`  Branch      : ${branch.name}`);
  console.log(`  Clients     : ${clientCount}`);
  console.log(`  Appointments: ${apptCount}`);
  console.log(`  Receipts    : ${saleCount}`);
  console.log('\n  Sign in at /login — all three accounts must change their password first:');
  console.log('    Owner        owner@anicaspa.ph      anica-owner   (approval PIN 2468)');
  console.log('    Manager      manager@anicaspa.ph    anica-admin   (approval PIN 1357)');
  console.log('    Receptionist reception@anicaspa.ph  anica-front\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
