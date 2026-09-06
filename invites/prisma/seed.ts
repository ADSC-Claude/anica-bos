/**
 * Demo data: staff accounts, the catalogue (packages, add-ons, coupons,
 * templates), and a fully built "Juan & Maria" wedding invitation used as
 * the live demo on the landing page — plus a Done-For-You job in progress and
 * a proof-of-payment waiting for review, so the admin has something to do.
 *
 * It DELETES EVERYTHING first.
 */
import { PrismaClient, type Occasion, type Tier } from '@prisma/client';
import { resolveDatabaseUrl } from '../src/lib/db-url';
import bcrypt from 'bcryptjs';
import { defaultContent, type Content } from '../src/lib/sections';
import { PALETTE_PRESETS, FONT_PRESETS } from '../src/lib/theme';
import { guestToken, orderReference, paymentReference } from '../src/lib/codes';
import { GIFT_PRESETS, RSVP_NOTE_PRESETS, POLICY_PRESETS, UNPLUGGED_PRESET } from '../src/lib/copy';
import { addDays } from '../src/lib/datetime';

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env.DATABASE_URL) });

/**
 * The demo password, and why it is not allowed off this machine.
 *
 * Seeding a database that is not local creates real accounts on a real site,
 * and this repository is public — so a password written in this file is a
 * password everybody already has, on an account whose e-mail is written two
 * screens down and whose role is ADMIN.
 *
 * `mustChangePassword` does not rescue it. That flag stops the account
 * reaching the admin pages, but whoever signs in has already signed in, and
 * the page it forces them to is the one that sets the new password. First
 * arrival keeps the account. So this password is for localhost, and any other
 * target has to supply its own through SEED_PASSWORD.
 */
const LOCAL_ONLY_PASSWORD = 'ChangeMe2026!';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

function isLocalDatabase(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function seedPassword(): { password: string; supplied: boolean } {
  const supplied = process.env.SEED_PASSWORD;
  if (supplied) {
    if (supplied.length < 12) {
      console.error('\n✗ SEED_PASSWORD is shorter than 12 characters.\n  These are the credentials for the live admin account; pick a real one.');
      process.exit(1);
    }
    return { password: supplied, supplied: true };
  }
  if (isLocalDatabase(process.env.DATABASE_URL)) {
    return { password: LOCAL_ONLY_PASSWORD, supplied: false };
  }
  console.error(
    '\n✗ Refusing to seed a remote database with the built-in demo password.\n' +
      '  It is written in this file, in a public repository, on an ADMIN account —\n' +
      '  and mustChangePassword does not help, because whoever signs in first is the\n' +
      '  one who gets to choose the new password.\n\n' +
      '  Set SEED_PASSWORD to something of your own and run this again.',
  );
  process.exit(1);
}

const { password: PASSWORD, supplied: PASSWORD_SUPPLIED } = seedPassword();

async function wipe() {
  const tables = ['DfyRevision', 'DfyJob', 'Rsvp', 'GuestbookEntry', 'Guest', 'SeatingTable', 'Media', 'InvitationView', 'Payment', 'OrderItem', 'Order', 'Invitation', 'SupportMessage', 'Notification', 'AuditLog', 'LoginEvent', 'Coupon', 'Template', 'AddOn', 'Package', 'Setting', 'User'];
  for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`);
}

const pal = (key: string) => PALETTE_PRESETS.find((p) => p.key === key)!.palette;
const fonts = (key: string) => FONT_PRESETS.find((f) => f.key === key)!.fonts;
const pic = (seed: string, w = 900, h = 1200) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function main() {
  console.info('Clearing…');
  await wipe();
  const hash = await bcrypt.hash(PASSWORD, 11);

  // --- people --------------------------------------------------------------
  const [admin, encoder, support, maria, sofia] = await Promise.all([
    prisma.user.create({ data: { email: 'owner@youreinvitedto.com', name: 'Angelica Corporal', role: 'ADMIN', passwordHash: hash, mustChangePassword: true } }),
    prisma.user.create({ data: { email: 'encoder@youreinvitedto.com', name: 'Encoder', role: 'ENCODER', passwordHash: hash, mustChangePassword: true } }),
    prisma.user.create({ data: { email: 'support@youreinvitedto.com', name: 'Support', role: 'SUPPORT', passwordHash: hash, mustChangePassword: true } }),
    prisma.user.create({ data: { email: 'maria@example.com', name: 'Maria Santos', role: 'CUSTOMER', phone: '0917 123 4567', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'sofia@example.com', name: 'Sofia Villanueva', role: 'CUSTOMER', phone: '0918 555 0101', passwordHash: hash } }),
  ]);

  // --- settings that differ from the defaults ------------------------------
  await prisma.setting.createMany({
    data: [
      { key: 'business.name', value: 'Invited' },
      { key: 'business.invitesCreatedLabel', value: '1,200+' },
      { key: 'business.rsvpsCollectedLabel', value: '85,000+' },
      { key: 'contact.messenger', value: 'https://m.me/invitedph' },
      { key: 'contact.viber', value: 'viber://chat?number=%2B639171234567' },
    ],
  });

  // --- packages (§4) --------------------------------------------------------
  const tiers: { tier: Tier; price: number; dfy: number; concierge: number; edits: number; validity: number; tagline: string }[] = [
    { tier: 'BASIC', price: 99900, dfy: 50000, concierge: 250000, edits: 3, validity: 30, tagline: 'The essentials: cover, venue, parents, dress code and a simple RSVP.' },
    { tier: 'STANDARD', price: 199900, dfy: 80000, concierge: 250000, edits: -1, validity: 182, tagline: 'Any design, the full entourage, gift QR, gallery, music, RSVP dashboard.' },
    { tier: 'COMPLETE', price: 349900, dfy: 120000, concierge: 250000, edits: -1, validity: 365, tagline: 'Per-guest links, seating, QR check-in, guestbook and premium designs.' },
  ];
  const occasionPackages: { occasion: Occasion | null; label: string; scale: number }[] = [
    { occasion: 'WEDDING', label: 'Wedding', scale: 1 },
    { occasion: 'DEBUT', label: 'Debut', scale: 0.9 },
    { occasion: 'CHRISTENING', label: 'Christening', scale: 0.75 },
    { occasion: 'KIDS_BIRTHDAY', label: "Kids' Birthday", scale: 0.65 },
    { occasion: null, label: 'Celebration', scale: 0.8 },
  ];
  let sort = 0;
  for (const op of occasionPackages) {
    for (const t of tiers) {
      await prisma.package.create({
        data: {
          code: `${op.occasion ?? 'ANY'}_${t.tier}`,
          occasion: op.occasion,
          tier: t.tier,
          name: `${op.label} ${t.tier.charAt(0)}${t.tier.slice(1).toLowerCase()}`,
          tagline: t.tagline,
          priceCents: Math.round((t.price * op.scale) / 100) * 100,
          dfyFeeCents: t.dfy,
          conciergeFeeCents: t.concierge,
          editsAfterPublish: t.edits,
          linkValidityDays: t.validity,
          sortOrder: sort++,
        },
      });
    }
  }

  await prisma.addOn.createMany({
    data: [
      { code: 'SAVE_THE_DATE', name: 'Save the Date card', description: 'A separate mini-invite with its own link, sent months ahead.', priceCents: 29900, sortOrder: 1 },
      { code: 'ENVELOPE', name: 'Animated envelope opening', description: 'Guests tap to open. Included free on the demo so you can see it.', priceCents: 19900, sortOrder: 2 },
      { code: 'PRINTABLE', name: 'Printable PDF / A5 layout + image export', description: 'A print-ready layout for the lolas.', priceCents: 29900, sortOrder: 3 },
      { code: 'TEMPLATE_SWITCH', name: 'Extra template switch', description: 'Change design after publishing (Basic tier).', priceCents: 19900, sortOrder: 4 },
      { code: 'RUSH', name: 'Rush publish (24 hours)', description: 'Done-For-You jumps the queue.', priceCents: 49900, sortOrder: 5 },
      { code: 'CUSTOM_DOMAIN', name: 'Custom domain setup', description: 'Your own domain (excludes domain cost).', priceCents: 99900, sortOrder: 6 },
      { code: 'SMS_PACK', name: 'SMS reminder blast (credit pack)', description: 'RSVP reminders by text. Priced per pack — ask us.', priceCents: 0, quoted: false, sortOrder: 7 },
    ],
  });

  await prisma.coupon.createMany({
    data: [
      { code: 'LAUNCH20', type: 'PERCENT', value: 20, note: 'Launch promo', expiresAt: addDays(new Date(), 90), usageLimit: 200 },
      { code: 'REFER500', type: 'FIXED', value: 50000, minSpendCents: 199900, note: 'Referral credit', usageLimit: 1000 },
      { code: 'EXPIRED10', type: 'PERCENT', value: 10, note: 'Old promo', expiresAt: addDays(new Date(), -1) },
    ],
  });

  // --- templates ------------------------------------------------------------
  const templates = await Promise.all(
    [
      { slug: 'classic-ivory', name: 'Classic Ivory', occasion: 'WEDDING', minTier: 'BASIC', layout: 'classic', palette: pal('ivory'), fonts: fonts('serif'), featured: true, description: 'Full-bleed photo, serif names, sage and gold.', thumb: pic('classic-ivory') },
      { slug: 'garden-botanical', name: 'Garden Botanical', occasion: 'WEDDING', minTier: 'BASIC', layout: 'garden', palette: pal('emerald'), fonts: fonts('serif'), featured: true, description: 'Arched photo, emerald and ivory. Tagaytay energy.', thumb: pic('garden-botanical') },
      { slug: 'modern-minimal', name: 'Modern Minimal', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'modern', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Uppercase sans, black and white, lots of air.', thumb: pic('modern-minimal') },
      { slug: 'filipiniana-gold', name: 'Filipiniana Gold', occasion: 'WEDDING', minTier: 'STANDARD', premium: true, layout: 'editorial', palette: pal('royal'), fonts: fonts('script'), featured: true, description: 'Royal blue and gold, script names. Premium.', thumb: pic('filipiniana-gold') },
      { slug: 'beach-sunset', name: 'Beach Sunset', occasion: 'WEDDING', minTier: 'STANDARD', layout: 'classic', palette: pal('sunset'), fonts: fonts('editorial'), featured: false, description: 'Warm sunset tones for Boracay, Siargao and La Union.', thumb: pic('beach-sunset') },
      { slug: 'enchanted-blush', name: 'Enchanted Blush', occasion: 'DEBUT', minTier: 'BASIC', layout: 'festive', palette: pal('blush'), fonts: fonts('script'), featured: true, description: 'Blush and gold with a script name for the debutante.', thumb: pic('enchanted-blush') },
      { slug: 'starlight-debut', name: 'Starlight', occasion: 'DEBUT', minTier: 'STANDARD', premium: true, layout: 'editorial', palette: pal('lilac'), fonts: fonts('editorial'), featured: false, description: 'Lilac and silver. Premium.', thumb: pic('starlight') },
      { slug: 'little-cloud', name: 'Little Cloud', occasion: 'CHRISTENING', minTier: 'BASIC', layout: 'garden', palette: pal('dusty'), fonts: fonts('playful'), featured: true, description: 'Dusty blue, soft and gentle. Binyag + 1st birthday ready.', thumb: pic('little-cloud') },
      { slug: 'party-pop', name: 'Party Pop', occasion: 'KIDS_BIRTHDAY', minTier: 'BASIC', layout: 'festive', palette: pal('pastel'), fonts: fonts('playful'), featured: true, description: 'Confetti and pastels for a lucky 7th.', thumb: pic('party-pop') },
      { slug: 'golden-hour', name: 'Golden Hour', occasion: 'MILESTONE_BIRTHDAY', minTier: 'BASIC', layout: 'editorial', palette: pal('navy'), fonts: fonts('serif'), featured: false, description: 'Navy and champagne for a 50th or 60th.', thumb: pic('golden-hour') },
      { slug: 'silver-jubilee', name: 'Silver Jubilee', occasion: 'ANNIVERSARY', minTier: 'BASIC', layout: 'classic', palette: pal('navy'), fonts: fonts('script'), featured: false, description: 'For silver and golden anniversaries and renewals of vows.', thumb: pic('silver-jubilee') },
      { slug: 'boardroom', name: 'Boardroom', occasion: 'CORPORATE', minTier: 'BASIC', layout: 'modern', palette: pal('mono'), fonts: fonts('modern'), featured: false, description: 'Logo, agenda, speakers and a registration QR.', thumb: pic('boardroom') },
      { slug: 'quiet-light', name: 'Quiet Light', occasion: 'MEMORIAL', minTier: 'BASIC', layout: 'quiet', palette: pal('slate'), fonts: fonts('serif'), featured: false, description: 'Muted and respectful, for the 40th day and babang luksa.', thumb: pic('quiet-light') },
    ].map((t, i) =>
      prisma.template.create({
        data: { slug: t.slug, name: t.name, occasion: t.occasion as Occasion, minTier: t.minTier as Tier, premium: t.premium ?? false, layout: t.layout, palette: t.palette as never, fonts: t.fonts as never, sections: [], featured: t.featured, description: t.description, thumbnailUrl: t.thumb, sortOrder: i },
      }),
    ),
  );
  const classic = templates[0];
  const garden = templates[1];
  const blush = templates[5];

  // --- the demo: Juan & Maria ---------------------------------------------
  const wedding = addDays(new Date(), 75);
  const dateKey = wedding.toISOString().slice(0, 10);
  const rsvpBy = addDays(wedding, -21).toISOString().slice(0, 10);
  const content: Content = defaultContent('WEDDING', 'en');
  Object.assign(content.cover!, {
    kind: 'wedding', brideFirst: 'Maria', groomFirst: 'Juan', brideFull: 'Maria Isabel Santos', groomFull: 'Juan Carlos Dela Cruz', brideNick: 'Maria', groomNick: 'Juan', monogram: 'J & M',
    date: dateKey, time: '14:00', introPreset: 'families', intro: 'Together with their families, Maria and Juan joyfully invite you to celebrate their wedding.',
    coverPhoto: pic('juan-maria-cover', 900, 1200), envelope: true,
  });
  Object.assign(content.countdown!, { enabled: true, label: 'Counting down to the big day' });
  Object.assign(content.parents!, {
    phrasing: 'together',
    brideFather: { title: 'Engr.', name: 'Roberto A. Santos', deceased: false }, brideMother: { title: 'Mrs.', name: 'Carmen L. Santos', deceased: false }, brideNote: '',
    groomFather: { title: 'Mr.', name: 'Antonio B. Dela Cruz', deceased: true }, groomMother: { title: 'Dr.', name: 'Teresita R. Dela Cruz', deceased: false }, groomNote: '',
  });
  Object.assign(content.ceremony!, { type: 'catholic', venue: 'San Agustin Church', address: 'General Luna St, Intramuros, Manila', date: dateKey, time: '14:00', seatedBy: '1:30 PM', mapsUrl: 'https://maps.app.goo.gl/2r5sQx1Wv4C9aZkY9', wazeUrl: '', photo: pic('san-agustin', 1200, 800), note: 'The church is air-conditioned. Please arrive early — Intramuros traffic is real.' });
  Object.assign(content.reception!, { venue: 'The Manila Hotel — Fiesta Pavilion', address: 'One Rizal Park, Ermita, Manila', time: '17:30', mapsUrl: '', wazeUrl: '', parkingNote: 'Free parking at the hotel. A shuttle leaves the church at 4:15 PM.', photo: pic('manila-hotel', 1200, 800), note: '' });
  Object.assign(content.entourage!, {
    principalSponsors: [
      { ninong: 'Mr. Jose Ramon Alcantara', ninang: 'Mrs. Lourdes Alcantara' }, { ninong: 'Atty. Federico Bautista', ninang: 'Dr. Milagros Bautista' }, { ninong: 'Engr. Danilo Cruz', ninang: 'Mrs. Rosario Cruz' },
      { ninong: 'Col. Ramon Villanueva (Ret.)', ninang: 'Mrs. Amparo Villanueva' }, { ninong: 'Mr. Ernesto Reyes', ninang: 'Ms. Corazon Reyes' }, { ninong: 'Hon. Alfredo Garcia', ninang: 'Mrs. Belen Garcia' },
    ],
    secondarySponsors: [{ role: 'candle', first: 'Mark Anthony Santos', second: 'Patricia Lim' }, { role: 'veil', first: 'Christian Dela Cruz', second: 'Andrea Gomez' }, { role: 'cord', first: 'Kevin Tan', second: 'Nicole Fernandez' }],
    bestMan: 'Miguel Angelo Dela Cruz', maidOfHonor: 'Ana Patricia Santos', honorTitle: 'maid', officiant: 'Rev. Fr. Benjamin Ocampo, OSA',
    groomsmen: [{ name: 'Rafael Mendoza' }, { name: 'Joshua Reyes' }, { name: 'Paolo Garcia' }, { name: 'Bryan Aquino' }],
    bridesmaids: [{ name: 'Camille Ramos' }, { name: 'Bianca Torres' }, { name: 'Erika Villanueva' }, { name: 'Danica Lim' }],
    juniorGroomsmen: [{ name: 'Lucas Santos' }], juniorBridesmaids: [{ name: 'Sophia Dela Cruz' }],
    littleGroom: 'Nathan Cruz', littleBride: 'Isabella Reyes', ringBearer: 'Gabriel Santos', coinBearer: 'Matteo Dela Cruz', bibleBearer: 'Elijah Ramos',
    flowerGirls: [{ name: 'Althea Santos' }, { name: 'Zoey Lim' }, { name: 'Mia Garcia' }],
  });
  Object.assign(content.dressCode!, { attire: 'formal', attireText: 'Long gown or cocktail dress for ladies; suit or Barong Tagalog for gentlemen.', colors: ['#5b6b4e', '#c9b48a', '#f4ede2', '#8c9a82'], avoidWhite: true, sponsorsAttire: 'Champagne gown / Barong Tagalog', entourageAttire: 'Sage green', note: '' });
  Object.assign(content.gift!, { preset: 'presence', text: GIFT_PRESETS[0].en, gcashName: 'Maria S.', gcashNumber: '0917 123 4567', gcashQr: pic('gcash-qr', 400, 400), bankDetails: 'BPI · Juan Carlos Dela Cruz · 1234 5678 90', registry: [] });
  Object.assign(content.rsvp!, { deadline: rsvpBy, showSeats: true, collectAttendees: true, askDietary: true, mealChoices: [{ label: 'Beef' }, { label: 'Fish' }, { label: 'Vegetarian' }], policy: 'adultsOnly', policyText: POLICY_PRESETS[0].en, notePreset: 'reserved', note: RSVP_NOTE_PRESETS[0].en, contactPhone: '0917 123 4567', reminderText: 'Hi {name}! Please RSVP for Juan & Maria’s wedding here: {link}' });
  Object.assign(content.story!, {
    howWeMet: 'We met in 2018 at a friend’s despedida in Katipunan — Juan spilled a whole cup of taho on Maria’s shoes and offered to buy her new ones. She said yes to the shoes, and eventually to everything else.',
    proposal: 'On a quiet morning in Sagada, before the sunrise crowd arrived, Juan asked. Maria cried so much the tour guide thought something was wrong.',
    timeline: [{ date: 'June 2018', title: 'The taho incident', text: 'Katipunan, Quezon City.', photo: pic('story-1', 800, 600) }, { date: 'December 2019', title: 'First trip together', text: 'Baguio, in a jeepney, freezing.', photo: pic('story-2', 800, 600) }, { date: 'February 2025', title: 'She said yes', text: 'Kiltepan viewpoint, Sagada.', photo: pic('story-3', 800, 600) }],
  });
  Object.assign(content.gallery!, { photos: [1, 2, 3, 4, 5, 6].map((n) => ({ url: pic(`prenup-${n}`, 900, 900), caption: n === 1 ? 'Prenup at Pinto Art Museum' : '' })), videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  Object.assign(content.program!, { items: [{ time: '2:00 PM', title: 'Ceremony', note: 'San Agustin Church' }, { time: '4:00 PM', title: 'Cocktails & photos', note: 'Fiesta Pavilion foyer' }, { time: '5:30 PM', title: 'Reception', note: 'Dinner, toasts and dancing' }, { time: '8:30 PM', title: 'After-party', note: 'Tap Room, Manila Hotel' }], activities: '' });
  Object.assign(content.faq!, { items: [{ q: 'Is there parking?', a: 'Yes — free at The Manila Hotel. Intramuros parking is limited, so we suggest carpooling or the shuttle.' }, { q: 'Can I bring my kids?', a: 'As much as we love your little ones, this celebration is for adults only.' }, { q: 'What if it rains?', a: 'Both venues are indoors. Bring an umbrella for the walk to the car.' }, { q: 'Is there a shuttle?', a: 'A coaster leaves the church at 4:15 PM for the hotel.' }, { q: 'Hashtag?', a: '#JuanAndMariaSayIDo — tag us!' }] });
  Object.assign(content.travel!, { hotels: [{ name: 'The Manila Hotel', address: 'One Rizal Park, Ermita', note: 'Use code JMWEDDING for the group rate', url: 'https://www.manila-hotel.com.ph' }, { name: 'Bayleaf Intramuros', address: 'Muralla St, Intramuros', note: 'Walking distance to the church', url: '' }], directions: 'From NAIA: Skyway to Roxas Blvd, exit at Rizal Park. About 40 minutes without traffic — allow 90.', tips: 'Grab and taxis are reliable in the area. The LRT-1 UN Avenue station is a 10-minute walk from both venues.' });
  Object.assign(content.social!, { hashtag: '#JuanAndMariaSayIDo', instagram: '@juanandmaria', facebook: '', unplugged: true, unpluggedText: UNPLUGGED_PRESET.en });
  Object.assign(content.music!, { url: '', title: 'Ikaw — Yeng Constantino', autoplay: true });
  Object.assign(content.guestbook!, { enabled: true, prompt: 'Leave a message for Juan & Maria', moderated: true });
  Object.assign(content.photos!, { enabled: true, prompt: 'Share your photos from the day — we will add them here', moderated: true });
  Object.assign(content.closing!, { message: 'Salamat for being part of our story. We cannot wait to celebrate with you.', signature: 'Juan & Maria', photo: pic('closing', 1200, 900) });

  const demo = await prisma.invitation.create({
    data: {
      userId: maria.id, templateId: classic.id, occasion: 'WEDDING', tier: 'COMPLETE', title: 'Juan & Maria', slug: 'juan-and-maria', status: 'PUBLISHED', privacy: 'PUBLIC',
      content: content as never, language: 'en', eventAt: new Date(`${dateKey}T14:00:00+08:00`), expiresAt: addDays(wedding, 365), ogImageUrl: pic('juan-maria-cover', 900, 1200), editsAllowed: -1, publishedAt: addDays(new Date(), -20), viewCount: 412, rsvpDeadline: new Date(`${rsvpBy}T23:59:59+08:00`),
    },
  });
  const weddingComplete = await prisma.package.findUniqueOrThrow({ where: { code: 'WEDDING_COMPLETE' } });
  const demoOrder = await prisma.order.create({
    data: {
      reference: orderReference(), userId: maria.id, packageId: weddingComplete.id, invitationId: demo.id, occasion: 'WEDDING', tier: 'COMPLETE', serviceMode: 'DIY',
      subtotalCents: weddingComplete.priceCents, addOnsCents: 19900, totalCents: weddingComplete.priceCents + 19900, status: 'ACTIVE', paidAt: addDays(new Date(), -25), activatedAt: addDays(new Date(), -25), createdAt: addDays(new Date(), -25),
      items: { create: [{ kind: 'PACKAGE', code: 'WEDDING_COMPLETE', name: weddingComplete.name, amountCents: weddingComplete.priceCents, sortOrder: 0 }, { kind: 'ADDON', code: 'ENVELOPE', name: 'Animated envelope opening', amountCents: 19900, sortOrder: 1 }] },
    },
  });
  await prisma.payment.create({ data: { reference: paymentReference(), orderId: demoOrder.id, provider: 'PAYMONGO', status: 'PAID', amountCents: demoOrder.totalCents, channel: 'gcash', gatewaySessionId: 'cs_demo', gatewayPaymentId: 'pay_demo', gatewayEventId: 'evt_demo', paidAt: addDays(new Date(), -25) } });

  const tables = await Promise.all(['Table 1 — Family', 'Table 2 — Ninongs & Ninangs', 'Table 3 — College friends', 'Table 4 — Office'].map((name, i) => prisma.seatingTable.create({ data: { invitationId: demo.id, name, capacity: 10, sortOrder: i } })));
  const guestRows = [
    ['Mr. & Mrs. Roberto Santos', 'Mr. & Mrs. Santos', "Bride's family", 2, 0], ['Engr. Danilo & Mrs. Rosario Cruz', 'Ninong Danny & Ninang Rose', 'Principal sponsors', 2, 1], ['Camille Ramos', 'Camille', 'College friends', 1, 2],
    ['Rafael Mendoza', 'Raf', 'College friends', 2, 2], ['Kevin & Nicole Tan', 'Kevin & Nicole', 'Office', 2, 3], ['Bianca Torres', 'Bianca', 'College friends', 1, 2], ['Atty. Federico & Dr. Milagros Bautista', 'Ninong Fred & Ninang Mila', 'Principal sponsors', 2, 1], ['Lola Nena Santos', 'Lola Nena', "Bride's family", 1, 0],
  ] as const;
  const guests = [];
  for (const [name, salutation, groupName, seats, table] of guestRows) {
    guests.push(await prisma.guest.create({ data: { invitationId: demo.id, name, salutation, groupName, seatsAllotted: seats, plusOneAllowed: groupName === 'College friends', token: guestToken(), tableId: tables[table].id, phone: '0917 000 0000' } }));
  }
  const rsvpRows = [[0, 'ACCEPT', 2, ['Roberto Santos', 'Carmen Santos'], 'Beef'], [1, 'ACCEPT', 2, ['Danilo Cruz', 'Rosario Cruz'], 'Fish'], [2, 'ACCEPT', 1, ['Camille Ramos'], 'Vegetarian'], [3, 'DECLINE', 0, [], ''], [5, 'ACCEPT', 1, ['Bianca Torres'], 'Beef']] as const;
  for (const [gi, response, seats, attendees, meal] of rsvpRows) {
    await prisma.rsvp.create({ data: { invitationId: demo.id, guestId: guests[gi].id, name: guests[gi].name, response, seats, attendees: [...attendees] as never, mealChoice: meal, message: response === 'ACCEPT' ? 'See you there! Congrats!' : 'So sorry, we will be abroad. Love you both!', createdAt: addDays(new Date(), -10 + gi) } });
  }
  await prisma.rsvp.create({ data: { invitationId: demo.id, name: 'Tita Baby Reyes', response: 'ACCEPT', seats: 3, attendees: ['Baby Reyes', 'Boy Reyes', 'Ate Jing'] as never, mealChoice: 'Beef', message: 'Excited na kami!', phone: '0918 111 2222' } });
  await prisma.media.createMany({
    data: [
      { invitationId: demo.id, kind: 'GUEST_PHOTO', url: pic('guest-photo-1', 900, 900), storagePath: 'seed/guest-photo-1.jpg', contentType: 'image/jpeg', caption: 'Grabe ang ganda ng church!', uploadedBy: 'Tita Baby', approved: true, sortOrder: 0 },
      { invitationId: demo.id, kind: 'GUEST_PHOTO', url: pic('guest-photo-2', 900, 900), storagePath: 'seed/guest-photo-2.jpg', contentType: 'image/jpeg', caption: 'First dance 🥹', uploadedBy: 'Camille', approved: true, sortOrder: 1 },
      { invitationId: demo.id, kind: 'GUEST_PHOTO', url: pic('guest-photo-3', 900, 900), storagePath: 'seed/guest-photo-3.jpg', contentType: 'image/jpeg', caption: 'The whole barkada', uploadedBy: 'Paolo', approved: false, sortOrder: 2 },
    ],
  });
  await prisma.guestbookEntry.createMany({ data: [{ invitationId: demo.id, name: 'Tita Baby', message: 'Finally! Ang tagal naming hinintay ito. Congratulations, Juan and Maria!', approved: true }, { invitationId: demo.id, name: 'Camille', message: 'From taho to “I do” — so proud of you two. ❤️', approved: true }, { invitationId: demo.id, name: 'Anonymous', message: 'Best wishes from the office!', approved: false }] });
  await prisma.invitationView.createMany({ data: Array.from({ length: 14 }, (_, i) => ({ invitationId: demo.id, day: new Date(addDays(new Date(), -i).toISOString().slice(0, 10)), count: 10 + ((i * 7) % 40) })) });

  // --- Sofia's debut: a Done-For-You job mid-way -----------------------------
  const debutStandard = await prisma.package.findUniqueOrThrow({ where: { code: 'DEBUT_STANDARD' } });
  const debutContent = defaultContent('DEBUT', 'en');
  Object.assign(debutContent.cover!, { celebrantFirst: 'Sofia', celebrantFull: 'Sofia Andrea Villanueva', theme: 'Enchanted Garden', date: addDays(new Date(), 40).toISOString().slice(0, 10), time: '18:00', intro: 'You are invited to celebrate as Sofia turns eighteen.', coverPhoto: pic('sofia-cover', 900, 1200), envelope: true });
  Object.assign(debutContent.reception!, { venue: 'Fernwood Gardens', address: 'Quezon City', time: '18:00' });
  const debut = await prisma.invitation.create({ data: { userId: sofia.id, templateId: blush.id, occasion: 'DEBUT', tier: 'STANDARD', title: "Sofia's 18th", slug: 'sofia-turns-18', status: 'DRAFT', content: debutContent as never, eventAt: addDays(new Date(), 40), editsAllowed: -1, ogImageUrl: pic('sofia-cover', 900, 1200) } });
  const debutOrder = await prisma.order.create({
    data: {
      reference: orderReference(), userId: sofia.id, packageId: debutStandard.id, invitationId: debut.id, occasion: 'DEBUT', tier: 'STANDARD', serviceMode: 'DFY',
      subtotalCents: debutStandard.priceCents, serviceFeeCents: debutStandard.dfyFeeCents, totalCents: debutStandard.priceCents + debutStandard.dfyFeeCents, status: 'ACTIVE', paidAt: addDays(new Date(), -3), activatedAt: addDays(new Date(), -3), createdAt: addDays(new Date(), -3),
      items: { create: [{ kind: 'PACKAGE', code: 'DEBUT_STANDARD', name: debutStandard.name, amountCents: debutStandard.priceCents, sortOrder: 0 }, { kind: 'SERVICE', code: 'SERVICE_DFY', name: 'Done-For-You service', amountCents: debutStandard.dfyFeeCents, sortOrder: 1 }] },
    },
  });
  await prisma.payment.create({ data: { reference: paymentReference(), orderId: debutOrder.id, provider: 'MANUAL', status: 'PAID', amountCents: debutOrder.totalCents, channel: 'GCash', payerName: 'Sofia Villanueva', payerReference: '1234567890', proofUrl: pic('proof-1', 600, 1000), reviewedById: support.id, reviewedAt: addDays(new Date(), -3), paidAt: addDays(new Date(), -3) } });
  const job = await prisma.dfyJob.create({
    data: {
      orderId: debutOrder.id, invitationId: debut.id, status: 'ENCODING', assigneeId: encoder.id, intakeMethod: 'FORM', intakeSubmittedAt: addDays(new Date(), -2), dueAt: addDays(new Date(), 1), revisionsAllowed: 2,
      intake: { method: 'FORM', notes: 'Theme is Enchanted Garden — lots of greenery and fairy lights. 18 Roses list is on the Viber message I sent.', content: { cover: debutContent.cover, reception: debutContent.reception, eighteen: { roses: [{ name: 'Papa', relation: 'Father' }, { name: 'Kuya Marco', relation: 'Brother' }, { name: 'Tito Jun', relation: 'Uncle' }] } } } as never,
      internalNotes: 'Waiting on the full 18 Roses list — customer said she will send it by Viber tonight.',
    },
  });
  await prisma.dfyRevision.create({ data: { jobId: job.id, round: 0, authorId: encoder.id, authorName: encoder.name, byStaff: true, body: 'Hi Sofia! Got your details — starting on the layout now. Please send the rest of the 18 Roses when you can.' } });

  // --- a christening order with a proof waiting for review ------------------
  const christBasic = await prisma.package.findUniqueOrThrow({ where: { code: 'CHRISTENING_BASIC' } });
  const cloud = templates[7];
  const christ = await prisma.invitation.create({ data: { userId: maria.id, templateId: cloud.id, occasion: 'CHRISTENING', tier: 'BASIC', title: "Baby Liam's Christening", slug: 'baby-liam-christening', status: 'DRAFT', content: defaultContent('CHRISTENING') as never, editsAllowed: 3 } });
  const christOrder = await prisma.order.create({
    data: {
      reference: orderReference(), userId: maria.id, packageId: christBasic.id, invitationId: christ.id, occasion: 'CHRISTENING', tier: 'BASIC', serviceMode: 'DIY', subtotalCents: christBasic.priceCents, totalCents: christBasic.priceCents, status: 'PENDING_PAYMENT',
      items: { create: [{ kind: 'PACKAGE', code: 'CHRISTENING_BASIC', name: christBasic.name, amountCents: christBasic.priceCents, sortOrder: 0 }] },
    },
  });
  await prisma.payment.create({ data: { reference: paymentReference(), orderId: christOrder.id, provider: 'MANUAL', status: 'PENDING', amountCents: christOrder.totalCents, channel: 'BPI', payerName: 'Maria Santos', payerReference: 'BPI-778812', proofUrl: pic('proof-2', 600, 1000) } });
  await prisma.notification.create({ data: { userId: support.id, title: `Proof of payment — ${christOrder.reference}`, body: 'BPI · Maria Santos', href: '/admin/payments' } });
  await prisma.supportMessage.create({ data: { userId: maria.id, invitationId: christ.id, body: 'Hi! I sent the BPI transfer for the christening invite — did you receive it?', channel: 'app' } });

  // Unused variable guard for garden template (kept for future demos).
  void garden;
  void admin;

  console.info(`
Seeded.

  Staff (password ${PASSWORD_SUPPLIED ? 'as supplied in SEED_PASSWORD' : `"${PASSWORD}"`}, forced to change on first sign-in):
    owner@youreinvitedto.com      Owner / Admin
    encoder@youreinvitedto.com    Encoder / Designer
    support@youreinvitedto.com    Support / Finance

  Customers (${PASSWORD_SUPPLIED ? 'same password' : `password "${PASSWORD}"`}):
    maria@example.com             owns the demo "Juan & Maria" (Complete) and a pending christening order
    sofia@example.com             Done-For-You debut in progress

  Demo invitation:  /juan-and-maria
  Personal guest link example:  /juan-and-maria/${guests[0].token}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
