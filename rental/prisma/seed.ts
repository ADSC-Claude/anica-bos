/**
 * Demo data: three properties across two branches, one account per role, and
 * roughly three months of operations that reconcile against each other.
 *
 * Reservations are pushed through the real lifecycle rather than inserted with
 * their final status, so spans, tasks, messages and inventory movements all
 * exist for the same reasons they would in production — and
 * `scripts/verify-integrity.ts` can check the result.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, manilaDateKey, toStayDate, nightsBetween } from '../src/lib/datetime';
import { bookingReference, guestCode, paymentReference, secretToken, accessCode, ticketNumber } from '../src/lib/codes';
import { DEFAULT_EXPENSE_CATEGORIES } from '../src/lib/finance';
import { DEFAULT_TEMPLATES } from '../src/lib/messaging';

const prisma = new PrismaClient();

const PASSWORD = 'ChangeMe2026!';
const TODAY = manilaDateKey();

function d(offset: number) {
  return toStayDate(addDays(TODAY, offset));
}

/** Deterministic pseudo-randomness, so a re-seed produces the same demo. */
let seedState = 42;
function rnd(max: number): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState % max;
}
function pick<T>(items: T[]): T {
  return items[rnd(items.length)];
}

async function wipe() {
  // Order matters only where a cascade does not cover it.
  const tables = [
    'ChecklistResult', 'CleaningRestock', 'InspectionArea', 'Inspection', 'CleaningTask',
    'MaintenanceTicket', 'Task', 'Incident', 'InventoryMovement', 'InventoryItem',
    'LinenMovement', 'LaundryBatchLine', 'LaundryBatch', 'LinenItem',
    'ScheduledMessage', 'Companion', 'CheckInSubmission', 'AccessRecord',
    'PromotionRedemption', 'PromotionProperty', 'Promotion',
    'ReservationAddOn', 'ReservationLine', 'Payment', 'SecurityDeposit',
    'CalendarSpan', 'CalendarBlock', 'IcalEvent', 'IcalFeed', 'Reservation',
    'Review', 'CampaignRecipient', 'Campaign', 'GuestNote', 'Guest',
    'Expense', 'ExpenseCategory', 'Document', 'Attachment', 'Vendor',
    'ChecklistItem', 'ChecklistTemplate', 'RateOverride', 'AddOn',
    'PropertyAmenity', 'PropertyFaq', 'PropertyPhoto', 'Amenity',
    'Notification', 'UserProperty', 'Property', 'AuditLog', 'LoginEvent',
    'MessageTemplate', 'Setting', 'User', 'Branch',
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`);
  }
}

async function main() {
  console.info('Clearing…');
  await wipe();

  const hash = await bcrypt.hash(PASSWORD, 11);

  // --- branches ------------------------------------------------------------
  const manila = await prisma.branch.create({
    data: { name: 'Metro Manila', city: 'Taguig', province: 'Metro Manila', isDefault: true, sortOrder: 1 },
  });
  const bulacan = await prisma.branch.create({
    data: { name: 'Bulacan', city: 'Santa Maria', province: 'Bulacan', sortOrder: 2 },
  });

  // --- people --------------------------------------------------------------
  const staff = await Promise.all(
    [
      { email: 'owner@anicastays.ph', name: 'Anica Reyes', role: 'OWNER' as const, branchId: manila.id },
      { email: 'manager@anicastays.ph', name: 'Paolo Mendoza', role: 'MANAGER' as const, branchId: manila.id },
      { email: 'desk@anicastays.ph', name: 'Kim Dela Cruz', role: 'RESERVATIONS' as const, branchId: manila.id },
      { email: 'books@anicastays.ph', name: 'Grace Lim', role: 'ACCOUNTANT' as const, branchId: manila.id },
      { email: 'ana@anicastays.ph', name: 'Ana Ramos', role: 'CLEANER' as const, branchId: manila.id, ratePerJobCents: 60000 },
      { email: 'rosa@anicastays.ph', name: 'Rosa Bautista', role: 'CLEANER' as const, branchId: bulacan.id, ratePerJobCents: 60000 },
      { email: 'inspect@anicastays.ph', name: 'Luis Tan', role: 'INSPECTOR' as const, branchId: manila.id, ratePerJobCents: 30000 },
      { email: 'fix@anicastays.ph', name: 'Ernesto Villar', role: 'MAINTENANCE' as const, branchId: manila.id },
    ].map((u) =>
      prisma.user.create({ data: { ...u, passwordHash: hash, mustChangePassword: true } }),
    ),
  );
  const [owner, manager, , , cleanerAna, cleanerRosa, inspector, maintainer] = staff;

  // --- amenities -----------------------------------------------------------
  const amenityNames: [string, string][] = [
    ['Wi-Fi', 'Essentials'], ['Air conditioning', 'Essentials'], ['Hot shower', 'Essentials'],
    ['Kitchen', 'Essentials'], ['Washing machine', 'Essentials'], ['Smart TV', 'Entertainment'],
    ['Netflix', 'Entertainment'], ['Workspace', 'Working'], ['Free parking', 'Access'],
    ['Lift', 'Access'], ['Swimming pool', 'Building'], ['Gym', 'Building'],
    ['24h security', 'Building'], ['Garden', 'Outdoors'], ['Balcony', 'Outdoors'],
    ['Coffee maker', 'Kitchen'], ['Microwave', 'Kitchen'], ['Fridge', 'Kitchen'],
  ];
  const amenities = await Promise.all(
    amenityNames.map(([name, category], i) =>
      prisma.amenity.create({ data: { name, category, sortOrder: i } }),
    ),
  );
  const amenityId = (name: string) => amenities.find((a) => a.name === name)!.id;

  // --- properties ----------------------------------------------------------
  const properties = await Promise.all([
    prisma.property.create({
      data: {
        code: 'SER', slug: 'serenity-suite-bgc', name: 'Serenity Suite, BGC', branchId: manila.id,
        type: 'CONDO', status: 'ACTIVE', featured: true, sortOrder: 1,
        shortDescription: 'A calm one-bedroom a short walk from High Street.',
        description:
          'A quiet, well-kept one-bedroom on the 18th floor, five minutes on foot from Bonifacio High Street.\n\nThe bed is a proper queen with good linen, the shower is hot and strong, and the desk by the window actually works for a day of calls. Building has a pool, a gym and 24-hour security.\n\nWe live nearby, so if anything is wrong we can be there.',
        maxGuests: 4, bedrooms: 1, beds: 2, bathrooms: 1, floorAreaSqm: 34,
        addressLine: '18F Tower Two, 7th Avenue', barangay: 'Fort Bonifacio', city: 'Taguig', province: 'Metro Manila',
        baseRateCents: 350000, weekendRateCents: 400000, cleaningFeeCents: 80000,
        extraGuestFeeCents: 50000, extraGuestAfter: 2, securityDepositCents: 300000,
        minNights: 1, maxNights: 30, checkInMinute: 900, checkOutMinute: 660,
        houseRules: 'No smoking anywhere indoors.\nNo parties or events.\nQuiet hours from 10pm.\nMaximum 4 guests — the building logs everyone in.',
        cancellationPolicy: 'Free cancellation up to 7 days before check-in. Within 7 days the deposit is non-refundable.',
        transportNotes: 'Grab from NAIA is about 25 minutes and ₱350–500. The BGC Bus stops two minutes away.',
        parkingNotes: 'One free parking slot in the basement — tell us your plate the day before.',
        nearbyAttractions: 'Bonifacio High Street (5 min walk)\nMarket! Market! (10 min)\nThe Mind Museum (12 min)',
        wifiName: 'Serenity_18F', wifiPassword: 'staywell2026',
        accessNotes: 'Keypad on the door: enter the code, then turn the handle. Reception has your name.',
        emergencyContact: '+63 917 555 0101 (Paolo, manager)',
        icalExportToken: secretToken(),
      },
    }),
    prisma.property.create({
      data: {
        code: 'SOL', slug: 'solaire-studio-qc', name: 'Solaire Studio, Quezon City', branchId: manila.id,
        type: 'STUDIO', status: 'ACTIVE', sortOrder: 2,
        shortDescription: 'A bright studio for two, walking distance to Katipunan.',
        description:
          'A compact, bright studio built for one or two people who want somewhere clean and quiet near Katipunan.\n\nGood mattress, blackout curtains, fast Wi-Fi, and a kitchenette with everything you need for breakfast. The building is small and well-run.',
        maxGuests: 2, bedrooms: 1, beds: 1, bathrooms: 1, floorAreaSqm: 22,
        addressLine: '5F Vista Residences, Katipunan Avenue', barangay: 'Loyola Heights', city: 'Quezon City', province: 'Metro Manila',
        baseRateCents: 220000, weekendRateCents: 250000, cleaningFeeCents: 60000,
        extraGuestFeeCents: 0, extraGuestAfter: 2, securityDepositCents: 200000,
        minNights: 1, maxNights: 60, checkInMinute: 840, checkOutMinute: 660,
        houseRules: 'No smoking.\nNo pets.\nTwo guests maximum.\nPlease keep noise down after 10pm — the walls are thin.',
        cancellationPolicy: 'Free cancellation up to 5 days before check-in.',
        transportNotes: 'Katipunan LRT-2 is a 10-minute walk. Grab from the airport is 45–60 minutes in traffic.',
        parkingNotes: 'Street parking only, and it fills up. We suggest Grab.',
        nearbyAttractions: 'Ateneo and UP Diliman (10 min)\nUP Town Center (15 min)',
        wifiName: 'SolaireStudio', wifiPassword: 'brightdays22',
        accessNotes: 'Lockbox to the right of the door. The code opens it; the key is inside.',
        emergencyContact: '+63 917 555 0101 (Paolo, manager)',
        icalExportToken: secretToken(),
      },
    }),
    prisma.property.create({
      data: {
        code: 'CAS', slug: 'casa-bulacan', name: 'Casa Bulacan', branchId: bulacan.id,
        type: 'HOUSE', status: 'ACTIVE', featured: true, sortOrder: 3,
        shortDescription: 'A three-bedroom family house with a garden, an hour from Manila.',
        description:
          'An old family house in Santa Maria, kept the way it was and made comfortable: three bedrooms, a long dining table, a garden with mango trees, and a kitchen built for cooking for a crowd.\n\nIt sleeps eight properly. Families take it for weekends and reunions; a few people have taken it for a month to write.',
        maxGuests: 8, bedrooms: 3, beds: 5, bathrooms: 2, floorAreaSqm: 180,
        addressLine: '14 Kalayaan Street', barangay: 'Poblacion', city: 'Santa Maria', province: 'Bulacan',
        baseRateCents: 600000, weekendRateCents: 750000, cleaningFeeCents: 150000,
        extraGuestFeeCents: 40000, extraGuestAfter: 6, securityDepositCents: 500000,
        minNights: 2, maxNights: 90, checkInMinute: 840, checkOutMinute: 720,
        houseRules: 'No smoking indoors — the garden is fine.\nNo loud music after 10pm; the neighbours are close.\nEight guests maximum without asking us first.\nPlease take your rubbish to the bins by the gate.',
        cancellationPolicy: 'Free cancellation up to 14 days before check-in. Within 14 days, half the deposit is returned.',
        transportNotes: 'About an hour from Manila by car via NLEX. We can arrange a van for larger groups.',
        parkingNotes: 'Three cars fit inside the gate.',
        nearbyAttractions: 'Santa Maria church (5 min)\nSan Jose del Monte market (20 min)\nBiak-na-Bato National Park (45 min)',
        wifiName: 'CasaBulacan', wifiPassword: 'mangotree88',
        accessNotes: 'Ate Rosa will meet you at the gate and hand over the keys.',
        emergencyContact: '+63 918 555 0202 (Rosa, caretaker)',
        icalExportToken: secretToken(),
      },
    }),
  ]);
  const [serenity, solaire, casa] = properties;

  // Photos: placeholder SVGs, so a fresh clone has a gallery without binaries
  // in the repository.
  for (const [i, p] of properties.entries()) {
    for (let n = 1; n <= 5; n++) {
      await prisma.propertyPhoto.create({
        data: {
          propertyId: p.id,
          url: `/images/placeholder-${((i + n) % 5) + 1}.svg`,
          caption: ['Living area', 'Bedroom', 'Bathroom', 'Kitchen', 'View'][n - 1],
          isCover: n === 1,
          sortOrder: n,
        },
      });
    }
  }

  const amenityPlan: Record<string, string[]> = {
    [serenity.id]: ['Wi-Fi', 'Air conditioning', 'Hot shower', 'Kitchen', 'Washing machine', 'Smart TV', 'Netflix', 'Workspace', 'Free parking', 'Lift', 'Swimming pool', 'Gym', '24h security', 'Coffee maker', 'Fridge'],
    [solaire.id]: ['Wi-Fi', 'Air conditioning', 'Hot shower', 'Kitchen', 'Smart TV', 'Workspace', 'Lift', '24h security', 'Microwave', 'Fridge'],
    [casa.id]: ['Wi-Fi', 'Air conditioning', 'Hot shower', 'Kitchen', 'Washing machine', 'Smart TV', 'Free parking', 'Garden', 'Balcony', 'Coffee maker', 'Microwave', 'Fridge'],
  };
  for (const [propertyId, names] of Object.entries(amenityPlan)) {
    for (const [i, name] of names.entries()) {
      await prisma.propertyAmenity.create({
        data: { propertyId, amenityId: amenityId(name), highlight: i < 4 },
      });
    }
  }

  await prisma.userProperty.createMany({
    data: [
      { userId: manager.id, propertyId: serenity.id },
      { userId: manager.id, propertyId: solaire.id },
      { userId: manager.id, propertyId: casa.id },
    ],
  });

  // --- site content --------------------------------------------------------
  await prisma.propertyFaq.createMany({
    data: [
      { question: 'Do I have to pay everything up front?', answer: 'No. A 30% deposit holds your dates, and the balance is due a week before you arrive. We send a payment link.', sortOrder: 1 },
      { question: 'Is it really cheaper to book direct?', answer: 'Yes. Booking platforms add their fee on top of our rate; here there is none, so the same stay costs less.', sortOrder: 2 },
      { question: 'What time can I check in?', answer: 'From 3pm at Serenity, 2pm at the others. Ask us about arriving earlier — if nobody stayed the night before, it is usually fine.', sortOrder: 3 },
      { question: 'How do I get in?', answer: 'On the morning you arrive we email your door code and the Wi-Fi. At Casa Bulacan, Ate Rosa meets you at the gate.', sortOrder: 4 },
      { question: 'Can I cancel?', answer: 'Free up to a week before check-in and your deposit comes back in full. Within the week, the deposit is not refundable.', sortOrder: 5 },
    ],
  });

  await prisma.addOn.createMany({
    data: [
      { name: 'Early check-in', description: 'From 11am, if nobody stayed the night before.', priceCents: 50000, per: 'STAY', sortOrder: 1 },
      { name: 'Late checkout', description: 'Until 4pm, subject to the next arrival.', priceCents: 50000, per: 'STAY', sortOrder: 2 },
      { name: 'Extra bedding', description: 'A folding bed with fresh linen.', priceCents: 35000, per: 'STAY', maxQuantity: 3, sortOrder: 3 },
      { name: 'Airport pickup', description: 'Met at arrivals, private car.', priceCents: 120000, per: 'STAY', sortOrder: 4 },
      { name: 'Mid-stay clean', description: 'A full clean and fresh towels.', priceCents: 80000, per: 'STAY', maxQuantity: 4, sortOrder: 5 },
      { name: 'Breakfast basket', description: 'Bread, eggs, coffee, fruit.', priceCents: 45000, per: 'GUEST', sortOrder: 6 },
    ],
  });

  await prisma.promotion.create({
    data: {
      code: 'DIRECT10', name: '10% off when you book direct', description: 'Skip the platform fee — 10% off any stay of 2 nights or more.',
      type: 'PERCENT', value: 10, minNights: 2, autoApply: true, active: true,
    },
  });
  await prisma.promotion.create({
    data: {
      code: 'WELCOMEBACK', name: 'Returning guest — 15% off', description: 'For guests who have stayed with us before.',
      type: 'PERCENT', value: 15, minNights: 1, audience: 'REPEAT', active: true,
    },
  });

  for (const t of DEFAULT_TEMPLATES) await prisma.messageTemplate.create({ data: t });

  // --- checklists ----------------------------------------------------------
  const template = await prisma.checklistTemplate.create({
    data: { name: 'Standard turnover', active: true },
  });
  const checklist: [string, string, boolean, boolean][] = [
    // area, label, requiresPhoto, mandatory
    ['Bedrooms', 'Strip and remake the beds', false, true],
    ['Bedrooms', 'Fresh linen on every bed', true, true],
    ['Bedrooms', 'Wipe surfaces and mirrors', false, true],
    ['Bedrooms', 'Vacuum or mop the floor', false, true],
    ['Bathroom', 'Clean the toilet', true, true],
    ['Bathroom', 'Shower, tiles and drain', false, true],
    ['Bathroom', 'Restock toiletries', false, true],
    ['Bathroom', 'Fresh towels hung', true, true],
    ['Kitchen', 'Empty and wipe the fridge', false, true],
    ['Kitchen', 'Wash and put away everything', false, true],
    ['Kitchen', 'Wipe counters and hob', false, true],
    ['Kitchen', 'Restock coffee and water', false, true],
    ['Living area', 'Cushions, sofa, surfaces', false, true],
    ['Living area', 'Floors swept and mopped', false, true],
    ['Living area', 'Check the Wi-Fi works', false, true],
    ['Living area', 'Check the aircon cools', false, true],
    ['Whole place', 'All rubbish out', true, true],
    ['Whole place', 'Check for damage', true, true],
    ['Whole place', 'Lost and found collected', false, false],
    ['Whole place', 'Slippers and amenities set out', false, false],
  ];
  for (const [i, [area, label, requiresPhoto, mandatory]] of checklist.entries()) {
    await prisma.checklistItem.create({
      data: { templateId: template.id, area, label, requiresPhoto, mandatory, sortOrder: i },
    });
  }

  // --- vendors and inventory ----------------------------------------------
  const [supplier, laundry, aircon] = await Promise.all([
    prisma.vendor.create({ data: { name: 'Metro Supplies Trading', kind: 'SUPPLIER', contactName: 'Ben Cruz', phone: '+63 917 555 0303', email: 'ben@metrosupplies.ph' } }),
    prisma.vendor.create({ data: { name: 'Sparkle Laundry Services', kind: 'LAUNDRY', contactName: 'Mila Santos', phone: '+63 917 555 0404', rateNotes: '₱65/kg, pickup and delivery, 24h turnaround' } }),
    prisma.vendor.create({ data: { name: 'CoolAir Servicing', kind: 'MAINTENANCE', contactName: 'Jun Reyes', phone: '+63 917 555 0505', rateNotes: '₱1,500 per split-type clean' } }),
  ]);

  const stockPlan: [string, string, string, number, number, number][] = [
    ['Toilet paper', 'Bathroom', 'roll', 24, 8, 3500],
    ['Shampoo sachets', 'Bathroom', 'pc', 40, 15, 1200],
    ['Soap bars', 'Bathroom', 'pc', 30, 12, 2000],
    ['Bath towels', 'Linen', 'pc', 12, 6, 25000],
    ['Coffee sachets', 'Kitchen', 'pc', 50, 20, 1500],
    ['Bottled water', 'Kitchen', 'bottle', 24, 12, 2500],
    ['Dish soap', 'Cleaning', 'bottle', 4, 2, 8500],
    ['All-purpose cleaner', 'Cleaning', 'bottle', 5, 2, 12000],
    ['Bin liners', 'Cleaning', 'pc', 60, 20, 500],
    ['Slippers', 'Guest amenities', 'pair', 10, 4, 6000],
  ];
  for (const p of properties) {
    for (const [name, category, unit, stockQty, minLevel, costCents] of stockPlan) {
      // One item is deliberately below its minimum so the low-stock alert has
      // something real to fire on.
      const qty = name === 'Toilet paper' && p.id === casa.id ? 4 : stockQty;
      const item = await prisma.inventoryItem.create({
        data: { propertyId: p.id, name, category, unit, stockQty: qty, minLevel, costCents, vendorId: supplier.id },
      });
      await prisma.inventoryMovement.create({
        data: { itemId: item.id, kind: 'PURCHASE', quantity: qty, note: 'Opening stock', createdById: owner.id },
      });
    }

    for (const [name, type, count] of [
      ['Queen bedsheet set', 'BEDSHEET', 6], ['Pillowcase', 'PILLOWCASE', 12],
      ['Bath towel', 'TOWEL', 12], ['Hand towel', 'TOWEL', 8], ['Bath mat', 'BATHMAT', 4],
    ] as [string, string, number][]) {
      await prisma.linenItem.create({
        data: {
          propertyId: p.id, name, type, parLevel: count,
          cleanQty: Math.ceil(count * 0.6), inUseQty: Math.floor(count * 0.25),
          dirtyQty: Math.floor(count * 0.1), atLaundryQty: Math.floor(count * 0.05),
        },
      });
    }
  }

  // --- expense categories, and three months of costs ------------------------
  const categories = await Promise.all(
    DEFAULT_EXPENSE_CATEGORIES.map((name, i) =>
      prisma.expenseCategory.create({ data: { name, sortOrder: i } }),
    ),
  );
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;

  const monthlyCosts: [string, string, number][] = [
    ['Utilities', 'Meralco and water', 480000],
    ['Internet', 'PLDT fibre', 199900],
    ['Association dues', 'Condo dues', 350000],
    ['Cleaning', 'Cleaner fees for the month', 480000],
    ['Laundry', 'Sparkle Laundry', 260000],
    ['Supplies', 'Toiletries and consumables', 180000],
    ['Marketing', 'Boosted posts', 150000],
  ];
  for (let m = 0; m < 3; m++) {
    for (const p of properties) {
      for (const [category, description, base] of monthlyCosts) {
        if (category === 'Marketing') continue; // business-wide, added below
        await prisma.expense.create({
          data: {
            propertyId: p.id, branchId: p.branchId, categoryId: cat(category),
            date: d(-(m * 30) - rnd(20)), amountCents: base + rnd(40) * 1000,
            description, vendorId: category === 'Laundry' ? laundry.id : category === 'Supplies' ? supplier.id : null,
            createdById: owner.id,
          },
        });
      }
    }
    // Business-wide: lands in the consolidated P&L, on no single property.
    await prisma.expense.create({
      data: {
        categoryId: cat('Marketing'), date: d(-(m * 30) - 5), amountCents: 150000,
        description: 'Boosted posts and listing photography', createdById: owner.id,
      },
    });
  }

  // --- documents, one of them expiring soon --------------------------------
  await prisma.document.createMany({
    data: [
      { propertyId: serenity.id, name: 'Barangay clearance', category: 'PERMIT', agency: 'Barangay Fort Bonifacio', refNumber: 'BC-2026-0142', issuedAt: d(-330), expiresAt: d(24), uploadedById: owner.id },
      { propertyId: casa.id, name: "Mayor's permit", category: 'PERMIT', agency: 'Santa Maria LGU', refNumber: 'MP-2026-8891', issuedAt: d(-200), expiresAt: d(160), uploadedById: owner.id },
      { propertyId: serenity.id, name: 'Condo lease agreement', category: 'CONTRACT', refNumber: 'LSE-2024-0031', issuedAt: d(-700), expiresAt: d(400), uploadedById: owner.id },
      { name: 'Property insurance', category: 'INSURANCE', agency: 'Pioneer Insurance', refNumber: 'POL-99120', issuedAt: d(-120), expiresAt: d(245), uploadedById: owner.id },
      { name: 'Sparkle Laundry agreement', category: 'VENDOR_AGREEMENT', refNumber: 'VA-2026-02', issuedAt: d(-90), uploadedById: owner.id },
    ],
  });

  // --- iCal feeds ----------------------------------------------------------
  for (const p of properties) {
    await prisma.icalFeed.create({
      data: { propertyId: p.id, direction: 'EXPORT', name: 'Our calendar', token: p.icalExportToken },
    });
    await prisma.icalFeed.create({
      data: {
        propertyId: p.id, direction: 'IMPORT', name: 'Airbnb',
        // Left blank so the poller skips it. Paste the real feed URL in
        // Settings → Sync to switch it on.
        url: '', active: false,
      },
    });
  }

  // --- guests --------------------------------------------------------------
  const guestNames: [string, string, string][] = [
    ['Maria', 'Santos', 'maria.santos@example.com'], ['Jun', 'Cruz', 'jun.cruz@example.com'],
    ['Bea', 'Reyes', 'bea.reyes@example.com'], ['Carlo', 'Aquino', 'carlo.aquino@example.com'],
    ['Divina', 'Lopez', 'divina.lopez@example.com'], ['Ella', 'Tan', 'ella.tan@example.com'],
    ['Francis', 'Uy', 'francis.uy@example.com'], ['Grace', 'Villanueva', 'grace.v@example.com'],
    ['Hiro', 'Tanaka', 'hiro.tanaka@example.jp'], ['Ivy', 'Ocampo', 'ivy.ocampo@example.com'],
    ['James', 'Miller', 'james.miller@example.co.uk'], ['Karla', 'Fernandez', 'karla.f@example.com'],
    ['Leo', 'Gutierrez', 'leo.g@example.com'], ['Mina', 'Park', 'mina.park@example.kr'],
    ['Noel', 'Bautista', 'noel.b@example.com'],
  ];
  const guests = await Promise.all(
    guestNames.map(([firstName, lastName, email], i) =>
      prisma.guest.create({
        data: {
          code: guestCode(), firstName, lastName, email,
          mobile: `+639${170000000 + i * 111111}`,
          country: email.endsWith('.jp') ? 'JP' : email.endsWith('.kr') ? 'KR' : email.endsWith('.uk') ? 'GB' : 'PH',
          marketingConsent: i % 3 !== 0,
          consentAt: i % 3 !== 0 ? d(-200) : null,
          unsubscribeToken: secretToken(),
        },
      }),
    ),
  );

  // --- reservations --------------------------------------------------------
  console.info('Booking…');

  type Plan = { property: typeof serenity; guest: (typeof guests)[number]; start: number; nights: number; adults: number; source: string; status: string };
  const plans: Plan[] = [];

  // Past stays, so the P&L and the KPIs have history to compute from.
  let cursor = -95;
  for (let i = 0; i < 16; i++) {
    const property = pick(properties);
    const nights = property.id === casa.id ? 2 + rnd(3) : 1 + rnd(4);
    plans.push({
      property,
      guest: guests[rnd(guests.length)],
      start: cursor,
      nights,
      adults: 1 + rnd(Math.min(4, property.maxGuests)),
      source: pick(['DIRECT', 'DIRECT', 'DIRECT', 'AIRBNB', 'AIRBNB', 'REFERRAL', 'PHONE']),
      status: 'COMPLETED',
    });
    cursor += 4 + rnd(4);
    if (cursor > -6) cursor = -95 + rnd(10);
  }

  // Live and upcoming.
  plans.push({ property: serenity, guest: guests[0], start: -1, nights: 3, adults: 2, source: 'DIRECT', status: 'CHECKED_IN' });
  plans.push({ property: casa, guest: guests[3], start: 0, nights: 3, adults: 6, source: 'DIRECT', status: 'CONFIRMED' });
  plans.push({ property: solaire, guest: guests[5], start: 2, nights: 2, adults: 1, source: 'AIRBNB', status: 'CONFIRMED' });
  plans.push({ property: serenity, guest: guests[7], start: 6, nights: 4, adults: 2, source: 'DIRECT', status: 'CONFIRMED' });
  plans.push({ property: casa, guest: guests[9], start: 12, nights: 3, adults: 8, source: 'REFERRAL', status: 'CONFIRMED' });
  plans.push({ property: solaire, guest: guests[11], start: 9, nights: 5, adults: 2, source: 'DIRECT', status: 'PENDING' });
  plans.push({ property: serenity, guest: guests[13], start: 20, nights: 2, adults: 3, source: 'CORPORATE', status: 'CONFIRMED' });
  plans.push({ property: casa, guest: guests[2], start: 28, nights: 4, adults: 7, source: 'DIRECT', status: 'CONFIRMED' });
  plans.push({ property: solaire, guest: guests[6], start: 35, nights: 3, adults: 2, source: 'AIRBNB', status: 'CONFIRMED' });

  const created: { id: string; status: string; propertyId: string }[] = [];

  for (const plan of plans) {
    const checkIn = d(plan.start);
    const checkOut = d(plan.start + plan.nights);
    const nights = nightsBetween(checkIn, checkOut);

    // Skip anything that would collide — the exclusion constraint would refuse
    // it anyway, and a seed that dies halfway is worse than one that thins out.
    const clash = await prisma.calendarSpan.findFirst({
      where: { propertyId: plan.property.id, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } },
    });
    if (clash) continue;

    const weekendNights = Array.from({ length: nights }, (_, i) => addDays(manilaDateKey(checkIn), i)).filter(
      (k) => [5, 6].includes(new Date(`${k}T00:00:00Z`).getUTCDay()),
    ).length;
    const accommodation =
      (nights - weekendNights) * plan.property.baseRateCents + weekendNights * (plan.property.weekendRateCents || plan.property.baseRateCents);
    const extraGuests = Math.max(0, plan.adults - plan.property.extraGuestAfter);
    const extraGuestCents = extraGuests * plan.property.extraGuestFeeCents * nights;
    const isAirbnb = plan.source === 'AIRBNB';
    const discount = isAirbnb ? 0 : Math.round((accommodation + plan.property.cleaningFeeCents) * 0.1);
    const total = isAirbnb ? 0 : accommodation + plan.property.cleaningFeeCents + extraGuestCents - discount;

    const reservation = await prisma.reservation.create({
      data: {
        reference: bookingReference(),
        propertyId: plan.property.id,
        guestId: plan.guest.id,
        source: plan.source as never,
        status: plan.status as never,
        checkIn, checkOut, nights,
        adults: plan.adults,
        nightlyRateCents: Math.round(accommodation / nights),
        accommodationCents: isAirbnb ? 0 : accommodation,
        cleaningFeeCents: isAirbnb ? 0 : plan.property.cleaningFeeCents,
        extraGuestCents: isAirbnb ? 0 : extraGuestCents,
        discountCents: isAirbnb ? 0 : discount,
        totalCents: total,
        paidCents: 0,
        depositRequiredCents: Math.round(total * 0.3),
        promoCode: isAirbnb ? '' : 'DIRECT10',
        confirmedAt: plan.status === 'PENDING' ? null : new Date(),
        holdExpiresAt: plan.status === 'PENDING' ? new Date(Date.now() + 25 * 60_000) : null,
        checkedInAt: ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(plan.status) ? new Date() : null,
        checkedOutAt: ['CHECKED_OUT', 'COMPLETED'].includes(plan.status) ? new Date() : null,
        completedAt: plan.status === 'COMPLETED' ? new Date() : null,
        externalUid: isAirbnb ? `seed-${bookingReference()}@airbnb.com` : null,
        internalNotes: isAirbnb ? 'Imported from Airbnb — money arrives as a payout.' : '',
        reviewToken: secretToken(),
        manageToken: secretToken(),
      },
    });

    if (!isAirbnb) {
      await prisma.reservationLine.createMany({
        data: [
          { reservationId: reservation.id, kind: 'ACCOMMODATION', label: `Nightly rate × ${nights} night${nights === 1 ? '' : 's'}`, quantity: nights, unitCents: Math.round(accommodation / nights), amountCents: accommodation, sortOrder: 0 },
          { reservationId: reservation.id, kind: 'CLEANING_FEE', label: 'Cleaning fee', quantity: 1, unitCents: plan.property.cleaningFeeCents, amountCents: plan.property.cleaningFeeCents, sortOrder: 1 },
          ...(extraGuestCents > 0 ? [{ reservationId: reservation.id, kind: 'EXTRA_GUEST' as const, label: `Extra guest × ${extraGuests} × ${nights}`, quantity: extraGuests * nights, unitCents: plan.property.extraGuestFeeCents, amountCents: extraGuestCents, sortOrder: 2 }] : []),
          { reservationId: reservation.id, kind: 'DISCOUNT', label: '10% off when you book direct (DIRECT10)', quantity: 1, unitCents: -discount, amountCents: -discount, sortOrder: 3 },
        ],
      });
    }

    await prisma.calendarSpan.create({
      data: {
        propertyId: plan.property.id, kind: 'RESERVATION',
        checkIn, checkOut, reservationId: reservation.id,
      },
    });

    if (plan.property.securityDepositCents > 0) {
      await prisma.securityDeposit.create({
        data: {
          reservationId: reservation.id,
          amountCents: plan.property.securityDepositCents,
          status: plan.status === 'PENDING' ? 'PENDING' : ['CHECKED_OUT', 'COMPLETED'].includes(plan.status) ? 'RETURNED' : 'HELD',
          heldAt: plan.status === 'PENDING' ? null : new Date(),
          returnedAt: ['CHECKED_OUT', 'COMPLETED'].includes(plan.status) ? new Date() : null,
        },
      });
    }

    // Money. Airbnb pays out; direct guests pay a deposit then the balance.
    if (isAirbnb) {
      const payout = accommodation + plan.property.cleaningFeeCents - Math.round(accommodation * 0.15);
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          totalCents: payout,
          // The payout is booked as accommodation as soon as it is known, not
          // only once the stay completes. A confirmed channel booking with a
          // total and no split counts its nights in occupancy, so leaving
          // accommodation at zero until checkout drags ADR down for every
          // forward-looking figure an owner reads.
          accommodationCents: payout,
          nightlyRateCents: Math.round(payout / nights),
          paidCents: plan.status === 'COMPLETED' ? payout : 0,
          paymentStatus: plan.status === 'COMPLETED' ? 'PAID' : 'UNPAID',
        },
      });
      if (plan.status === 'COMPLETED') {
        await prisma.payment.create({
          data: { reference: paymentReference(), reservationId: reservation.id, kind: 'FULL', method: 'AIRBNB_PAYOUT', amountCents: payout, status: 'PAID', paidAt: checkOut, notes: 'Airbnb payout, net of platform fee' },
        });
        await prisma.reservationLine.create({
          data: { reservationId: reservation.id, kind: 'ACCOMMODATION', label: `Airbnb payout, ${nights} night${nights === 1 ? '' : 's'}`, quantity: nights, unitCents: Math.round(payout / nights), amountCents: payout, sortOrder: 0 },
        });
      }
    } else if (plan.status !== 'PENDING') {
      const deposit = Math.round(total * 0.3);
      const fullyPaid = ['CHECKED_IN', 'CHECKED_OUT', 'COMPLETED'].includes(plan.status) || plan.start < 5;
      await prisma.payment.create({
        data: { reference: paymentReference(), reservationId: reservation.id, kind: fullyPaid ? 'DOWNPAYMENT' : 'DOWNPAYMENT', method: 'PAYMONGO', amountCents: deposit, status: 'PAID', paidAt: new Date(), gatewayId: `seed_pay_${reservation.id}` },
      });
      if (fullyPaid) {
        await prisma.payment.create({
          data: { reference: paymentReference(), reservationId: reservation.id, kind: 'BALANCE', method: 'PAYMONGO', amountCents: total - deposit, status: 'PAID', paidAt: new Date(), gatewayId: `seed_bal_${reservation.id}` },
        });
      }
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          paidCents: fullyPaid ? total : deposit,
          paymentStatus: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
          balanceDueAt: fullyPaid ? null : d(plan.start - 7),
        },
      });
    }

    if (['CHECKED_IN'].includes(plan.status)) {
      const code = accessCode();
      await prisma.accessRecord.create({
        data: {
          reservationId: reservation.id, propertyId: plan.property.id, method: 'KEYPAD_CODE',
          code, instructions: plan.property.accessNotes, activatesAt: checkIn, expiresAt: checkOut, issuedById: manager.id,
        },
      });
    }

    // Message history for completed stays, so a reservation page has a timeline.
    if (plan.status === 'COMPLETED') {
      for (const key of ['booking_confirmed', 'pre_arrival', 'checkin_day', 'post_checkout', 'review_request']) {
        await prisma.scheduledMessage.create({
          data: {
            reservationId: reservation.id, templateKey: key, scheduledFor: checkIn,
            status: 'SENT', sentAt: checkIn, to: plan.guest.email,
            subject: DEFAULT_TEMPLATES.find((t) => t.key === key)?.subject ?? key, attempts: 1,
          },
        });
      }
    }

    created.push({ id: reservation.id, status: plan.status, propertyId: plan.property.id });
  }

  // --- operations ----------------------------------------------------------
  console.info('Cleaning…');

  // One live turnover waiting for a cleaner, so the task board is not empty.
  const turnoverProperty = solaire;
  const cleaningTask = await prisma.task.create({
    data: {
      propertyId: turnoverProperty.id, kind: 'CLEANING', title: `Turnover — ${turnoverProperty.name}`,
      assigneeId: cleanerAna.id, dueAt: new Date(Date.now() + 5 * 3_600_000), priority: 'HIGH', status: 'OPEN',
    },
  });
  const cleaning = await prisma.cleaningTask.create({
    data: {
      taskId: cleaningTask.id, propertyId: turnoverProperty.id, templateId: template.id,
      status: 'ASSIGNED', assigneeId: cleanerAna.id,
      checkoutAt: new Date(Date.now() - 2 * 3_600_000),
      nextCheckInAt: new Date(Date.now() + 5 * 3_600_000),
    },
  });
  const items = await prisma.checklistItem.findMany({ where: { templateId: template.id } });
  await prisma.checklistResult.createMany({
    data: items.map((i) => ({ cleaningTaskId: cleaning.id, itemId: i.id })),
  });
  await prisma.property.update({ where: { id: turnoverProperty.id }, data: { readyState: 'CLEANING' } });

  // A second one already in inspection, so the READY gate is visible.
  const inspectTask = await prisma.task.create({
    data: {
      propertyId: casa.id, kind: 'INSPECTION', title: `Inspect — ${casa.name}`,
      assigneeId: inspector.id, dueAt: new Date(Date.now() + 20 * 3_600_000), priority: 'HIGH',
    },
  });
  await prisma.inspection.create({
    data: { taskId: inspectTask.id, propertyId: casa.id, inspectorId: inspector.id, status: 'PENDING' },
  });
  // The READY gate is a predicate over open work; readyState is its cache. A
  // seed that sets one without the other produces a demo that lies, which is
  // exactly what scripts/verify-integrity.ts is there to catch.
  await prisma.property.update({ where: { id: casa.id }, data: { readyState: 'INSPECTION' } });

  // Maintenance: one ordinary, one emergency.
  for (const [property, category, description, priority, status] of [
    [serenity, 'Aircon', 'Bedroom aircon is not cooling properly — needs a clean or a recharge.', 'HIGH', 'ASSIGNED'],
    [casa, 'Plumbing', 'Kitchen tap drips constantly.', 'MEDIUM', 'REPORTED'],
    [solaire, 'Electrical', 'Bathroom light flickers and the switch is warm.', 'URGENT', 'IN_PROGRESS'],
  ] as [typeof serenity, string, string, string, string][]) {
    const task = await prisma.task.create({
      data: {
        propertyId: property.id, kind: 'MAINTENANCE', title: `${category} — ${property.name}`,
        assigneeId: maintainer.id, priority: priority as never, dueAt: d(2),
      },
    });
    await prisma.maintenanceTicket.create({
      data: {
        number: ticketNumber(2026), taskId: task.id, propertyId: property.id, category, description,
        priority: priority as never, status: status as never, reportedById: manager.id,
        assigneeId: maintainer.id, vendorId: category === 'Aircon' ? aircon.id : null,
      },
    });
  }

  // An incident with a deposit deduction, linked to a real past stay.
  const pastStay = created.find((c) => c.status === 'COMPLETED');
  if (pastStay) {
    const stay = await prisma.reservation.findUniqueOrThrow({ where: { id: pastStay.id } });
    await prisma.incident.create({
      data: {
        propertyId: stay.propertyId, reservationId: stay.id, guestId: stay.guestId,
        occurredAt: stay.checkOut, type: 'DAMAGE',
        description: 'Wine glass broken and a stain on the sofa arm. Guest told us before leaving.',
        itemsAffected: '1 wine glass, sofa cover cleaning',
        estimatedCostCents: 120000, actualCostCents: 95000,
        action: 'CHARGE_DEPOSIT', status: 'RESOLVED',
        resolution: 'Deducted from the deposit with the guest’s agreement; the rest was returned.',
        reportedById: cleanerRosa.id, resolvedAt: new Date(),
      },
    });
  }

  // --- reviews -------------------------------------------------------------
  const reviewTexts: [number, string, string][] = [
    [5, 'Exactly as described', 'Spotless, quiet, and the bed is genuinely comfortable. The check-in instructions arrived the morning we flew in, which took all the worry out of it.'],
    [5, 'Our favourite place in BGC', 'Third time here. Anica answers within minutes and the place is always ready early when they can manage it.'],
    [4, 'Great value', 'Small but very well thought out. Only note is the street outside gets noisy around 7am.'],
    [5, 'Perfect for our family reunion', 'The garden made the weekend. Eight of us, plenty of room, and Ate Rosa was lovely.'],
    [5, 'Would book again', 'Clean, easy, honest pricing. Booking direct saved us about a thousand pesos over the app.'],
    [4, 'Comfortable and quiet', 'Good aircon, strong shower, fast Wi-Fi. Would have liked a kettle.'],
  ];
  for (const [i, [rating, title, body]] of reviewTexts.entries()) {
    const property = properties[i % properties.length];
    await prisma.review.create({
      data: {
        propertyId: property.id, guestId: guests[i].id, platform: i % 3 === 0 ? 'AIRBNB' : 'DIRECT',
        guestName: `${guests[i].firstName} ${guests[i].lastName[0]}.`,
        rating, title, body, stayDate: d(-30 - i * 7), published: true, featured: i < 3,
        tags: rating === 5 ? ['clean', 'communication'] : ['value'],
        response: i === 2 ? 'Thank you — we have since added heavier curtains, which helps with the morning noise.' : '',
        respondedAt: i === 2 ? new Date() : null,
        respondedById: i === 2 ? owner.id : null,
      },
    });
  }

  // --- guest stats ---------------------------------------------------------
  const { refreshGuestStats } = await import('../src/lib/guests');
  for (const g of guests) await refreshGuestStats(g.id);

  console.info('\nSeeded.');
  console.info(`  ${properties.length} properties in 2 branches`);
  console.info(`  ${staff.length} accounts, ${guests.length} guests, ${created.length} reservations`);
  console.info('\nSign in with any of these — every one is forced to set a new password first:');
  for (const u of staff) console.info(`  ${u.email.padEnd(28)} ${u.role.padEnd(14)} ${PASSWORD}`);
  console.info('\nThe public site is at /, the portal at /login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
