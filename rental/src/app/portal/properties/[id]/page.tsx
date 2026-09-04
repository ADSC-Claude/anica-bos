import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage, assertProperty } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, toCents } from '@/lib/money';
import {
  formatStayDate,
  labelToMinutes,
  minutesToInput,
  minutesToLabel,
  toStayDate,
} from '@/lib/datetime';
import { storeFile } from '@/lib/storage';
import { absoluteUrl } from '@/lib/app-url';
import { audit, diff } from '@/lib/audit';
import {
  BackLink,
  Card,
  Empty,
  Field,
  Notice,
  PageHeader,
  Pill,
  ReadyPill,
  TextArea,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

function back(id: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/properties/${id}?${kind}=${encodeURIComponent(message)}`);
}

async function guard(id: string) {
  const user = await requirePage('properties.edit');
  const property = await prisma.property.findUnique({ where: { id }, select: { id: true } });
  if (!property) notFound();
  await assertProperty(user, id);
  return user;
}

async function saveAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guard(id);

  const before = await prisma.property.findUniqueOrThrow({ where: { id } });
  const after = {
    name: String(formData.get('name') ?? '').trim() || before.name,
    status: String(formData.get('status') || before.status) as never,
    type: String(formData.get('type') || before.type) as never,
    shortDescription: String(formData.get('shortDescription') ?? ''),
    description: String(formData.get('description') ?? ''),
    maxGuests: Number(formData.get('maxGuests') ?? before.maxGuests),
    bedrooms: Number(formData.get('bedrooms') ?? before.bedrooms),
    beds: Number(formData.get('beds') ?? before.beds),
    bathrooms: Number(formData.get('bathrooms') ?? before.bathrooms),
    floorAreaSqm: Number(formData.get('floorAreaSqm') ?? before.floorAreaSqm),
    addressLine: String(formData.get('addressLine') ?? ''),
    barangay: String(formData.get('barangay') ?? ''),
    city: String(formData.get('city') ?? ''),
    province: String(formData.get('province') ?? ''),
    mapEmbedUrl: String(formData.get('mapEmbedUrl') ?? ''),
    checkInMinute: labelToMinutes(String(formData.get('checkInMinute') || minutesToInput(before.checkInMinute))),
    checkOutMinute: labelToMinutes(String(formData.get('checkOutMinute') || minutesToInput(before.checkOutMinute))),
    baseRateCents: toCents(String(formData.get('baseRate') || '0')),
    weekendRateCents: toCents(String(formData.get('weekendRate') || '0')),
    cleaningFeeCents: toCents(String(formData.get('cleaningFee') || '0')),
    extraGuestFeeCents: toCents(String(formData.get('extraGuestFee') || '0')),
    extraGuestAfter: Number(formData.get('extraGuestAfter') ?? before.extraGuestAfter),
    securityDepositCents: toCents(String(formData.get('securityDeposit') || '0')),
    minNights: Number(formData.get('minNights') ?? before.minNights),
    maxNights: Number(formData.get('maxNights') ?? before.maxNights),
    houseRules: String(formData.get('houseRules') ?? ''),
    cancellationPolicy: String(formData.get('cancellationPolicy') ?? ''),
    nearbyAttractions: String(formData.get('nearbyAttractions') ?? ''),
    transportNotes: String(formData.get('transportNotes') ?? ''),
    parkingNotes: String(formData.get('parkingNotes') ?? ''),
    featured: formData.get('featured') === 'on',
  };

  if (after.minNights > after.maxNights) {
    back(id, 'The minimum stay cannot be longer than the maximum.', 'error');
  }
  if (after.status === 'ACTIVE' && after.baseRateCents <= 0) {
    back(id, 'A property cannot go live without a nightly rate.', 'error');
  }

  await prisma.property.update({ where: { id }, data: after });

  const changes = diff(before as unknown as Record<string, unknown>, after as Record<string, unknown>);
  await audit(user, {
    module: 'properties',
    action: 'update',
    entityType: 'Property',
    entityId: id,
    propertyId: id,
    summary: `${after.name} updated`,
    before: changes.before,
    after: changes.after,
  });
  back(id, 'Saved.');
}

async function credentialsAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guard(id);

  await prisma.property.update({
    where: { id },
    data: {
      wifiName: String(formData.get('wifiName') ?? ''),
      wifiPassword: String(formData.get('wifiPassword') ?? ''),
      accessNotes: String(formData.get('accessNotes') ?? ''),
      emergencyContact: String(formData.get('emergencyContact') ?? ''),
    },
  });

  // Deliberately no before/after payload: an audit log that records the Wi-Fi
  // password is a second place the Wi-Fi password lives.
  await audit(user, {
    module: 'properties',
    action: 'credentials.update',
    entityType: 'Property',
    entityId: id,
    propertyId: id,
    summary: 'Access details and Wi-Fi updated',
  });
  back(id, 'Access details saved. They reach a guest only on the morning they arrive.');
}

async function photoAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guard(id);

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) back(id, 'Choose a photo first.', 'error');

  try {
    const stored = await storeFile({
      file,
      entityType: 'property',
      entityId: id,
      visibility: 'public',
    });
    const count = await prisma.propertyPhoto.count({ where: { propertyId: id } });
    await prisma.propertyPhoto.create({
      data: {
        propertyId: id,
        url: stored.url,
        storagePath: stored.storagePath,
        caption: String(formData.get('caption') ?? ''),
        isCover: count === 0,
        sortOrder: count,
      },
    });
  } catch {
    back(id, 'That file could not be read. JPEG, PNG or WebP, up to 8 MB.', 'error');
  }

  await audit(user, {
    module: 'properties',
    action: 'photo.add',
    entityType: 'Property',
    entityId: id,
    propertyId: id,
    summary: 'Photo added',
  });
  back(id, 'Photo added.');
}

async function photoOpAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const photoId = String(formData.get('photoId'));
  const op = String(formData.get('op'));
  await guard(id);

  if (op === 'delete') {
    await prisma.propertyPhoto.delete({ where: { id: photoId } });
    back(id, 'Photo removed.');
  }

  // Exactly one cover, always: clearing them all first is what makes that true
  // rather than merely usually true.
  await prisma.$transaction([
    prisma.propertyPhoto.updateMany({ where: { propertyId: id }, data: { isCover: false } }),
    prisma.propertyPhoto.update({ where: { id: photoId }, data: { isCover: true } }),
  ]);
  back(id, 'Cover photo set.');
}

async function amenitiesAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guard(id);

  const chosen = formData.getAll('amenityIds').map(String).filter(Boolean);
  const starred = new Set(formData.getAll('highlightIds').map(String));

  // Validated against the catalogue, so a stale or hand-edited form cannot
  // write rows for amenities that no longer exist.
  const offered = await prisma.amenity.findMany({
    where: { id: { in: chosen }, active: true },
    select: { id: true, name: true },
  });

  const before = await prisma.propertyAmenity.findMany({
    where: { propertyId: id },
    include: { amenity: { select: { name: true } } },
  });

  await prisma.$transaction([
    prisma.propertyAmenity.deleteMany({ where: { propertyId: id } }),
    prisma.propertyAmenity.createMany({
      data: offered.map((a) => ({
        propertyId: id,
        amenityId: a.id,
        // A star only counts on an amenity the place actually offers.
        highlight: starred.has(a.id),
      })),
    }),
  ]);

  await audit(user, {
    module: 'properties',
    action: 'amenities.set',
    entityType: 'Property',
    entityId: id,
    propertyId: id,
    summary: `Amenities set: ${offered.length} offered, ${offered.filter((a) => starred.has(a.id)).length} featured`,
    before: {
      offered: before.map((l) => l.amenity.name),
      featured: before.filter((l) => l.highlight).map((l) => l.amenity.name),
    },
    after: {
      offered: offered.map((a) => a.name),
      featured: offered.filter((a) => starred.has(a.id)).map((a) => a.name),
    },
  });
  back(id, 'Amenities saved.');
}

async function rateAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guard(id);

  const fromKey = String(formData.get('from') ?? '');
  const toKey = String(formData.get('to') ?? '');
  if (!fromKey || !toKey || toKey < fromKey) back(id, 'Give a date range that runs forwards.', 'error');

  const rate = toCents(String(formData.get('rate') || '0'));
  if (rate <= 0) back(id, 'A per-date rate must be more than zero.', 'error');

  const dates: Date[] = [];
  for (let d = new Date(`${fromKey}T00:00:00Z`); d <= new Date(`${toKey}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d));
  }
  if (dates.length > 366) back(id, 'That is more than a year at a time.', 'error');

  const minNightsRaw = String(formData.get('minNights') ?? '');
  for (const date of dates) {
    await prisma.rateOverride.upsert({
      where: { propertyId_date: { propertyId: id, date } },
      create: {
        propertyId: id,
        date,
        nightlyRateCents: rate,
        minNights: minNightsRaw ? Number(minNightsRaw) : null,
        closed: formData.get('closed') === 'on',
        note: String(formData.get('note') ?? ''),
      },
      update: {
        nightlyRateCents: rate,
        minNights: minNightsRaw ? Number(minNightsRaw) : null,
        closed: formData.get('closed') === 'on',
        note: String(formData.get('note') ?? ''),
      },
    });
  }

  await audit(user, {
    module: 'properties',
    action: 'rates.override',
    entityType: 'Property',
    entityId: id,
    propertyId: id,
    summary: `${dates.length} night${dates.length === 1 ? '' : 's'} priced at ${formatPeso(rate)}`,
  });
  back(id, `${dates.length} night${dates.length === 1 ? '' : 's'} repriced. Stays already booked keep the rate they agreed.`);
}

async function clearRateAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  await guard(id);
  await prisma.rateOverride.delete({ where: { id: String(formData.get('overrideId')) } });
  back(id, 'Back to the base rate for that night.');
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePage('properties.view');

  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
      photos: { orderBy: { sortOrder: 'asc' } },
      rateOverrides: { where: { date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 60 },
      amenities: { include: { amenity: true } },
      _count: { select: { reservations: true } },
    },
  });
  if (!property) notFound();
  await assertProperty(user, id);

  const mayEdit = can(user.role, 'properties.edit');
  const feedUrl = absoluteUrl(`/api/ical/${property.icalExportToken}`);

  const amenityCatalogue = await prisma.amenity.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  /** amenityId → highlighted, for the ticked state of both checkboxes. */
  const amenityLinks = new Map(property.amenities.map((l) => [l.amenityId, l.highlight]));
  const amenityGroups = new Map<string, typeof amenityCatalogue>();
  for (const a of amenityCatalogue) {
    amenityGroups.set(a.category, [...(amenityGroups.get(a.category) ?? []), a]);
  }

  return (
    <>
      <BackLink href="/portal/properties">All properties</BackLink>
      <PageHeader
        title={property.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{property.code}</span>
            <Pill tone={property.status === 'ACTIVE' ? 'ok' : 'muted'}>
              {property.status.toLowerCase()}
            </Pill>
            <ReadyPill state={property.readyState} />
            <span className="text-xs">{property.branch.name}</span>
          </span>
        }
        actions={
          property.status === 'ACTIVE' && (
            <Link className="btn btn-secondary" href={`/stays/${property.slug}`} target="_blank">
              Public page
            </Link>
          )
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      {!mayEdit && (
        <Notice kind="error">Your role can see this property but not change it.</Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="The listing">
            <form action={saveAction} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={property.id} />
              <div className="sm:col-span-2">
                <Field label="Name" name="name" defaultValue={property.name} required />
              </div>
              <label className="block">
                <span className="label">Status</span>
                <select className="field" name="status" defaultValue={property.status} disabled={!mayEdit}>
                  <option value="DRAFT">Draft — not on the site</option>
                  <option value="ACTIVE">Active — bookable</option>
                  <option value="INACTIVE">Inactive — visible, not bookable</option>
                </select>
              </label>

              <label className="block">
                <span className="label">Type</span>
                <select className="field" name="type" defaultValue={property.type} disabled={!mayEdit}>
                  {['CONDO', 'HOUSE', 'APARTMENT', 'VILLA', 'STUDIO', 'TOWNHOUSE'].map((t) => (
                    <option key={t} value={t}>
                      {t.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Sleeps" name="maxGuests" type="number" min="1" defaultValue={property.maxGuests} />
              <Field label="Floor area (sqm)" name="floorAreaSqm" type="number" min="0" defaultValue={property.floorAreaSqm} />
              <Field label="Bedrooms" name="bedrooms" type="number" min="0" defaultValue={property.bedrooms} />
              <Field label="Beds" name="beds" type="number" min="0" defaultValue={property.beds} />
              <Field label="Bathrooms" name="bathrooms" type="number" min="0" defaultValue={property.bathrooms} />

              <div className="sm:col-span-3">
                <TextArea
                  label="One-line description"
                  name="shortDescription"
                  defaultValue={property.shortDescription}
                  rows={2}
                  hint="Shown on the cards and in search results."
                />
              </div>
              <div className="sm:col-span-3">
                <TextArea label="Full description" name="description" defaultValue={property.description} rows={5} />
              </div>

              <div className="sm:col-span-2">
                <Field label="Street address" name="addressLine" defaultValue={property.addressLine} />
              </div>
              <Field label="Barangay" name="barangay" defaultValue={property.barangay} />
              <Field label="City" name="city" defaultValue={property.city} />
              <Field label="Province" name="province" defaultValue={property.province} />
              <div className="sm:col-span-3">
                <Field label="Map embed URL" name="mapEmbedUrl" defaultValue={property.mapEmbedUrl} />
              </div>

              <label className="block">
                <span className="label">Check-in from</span>
                <input className="field" name="checkInMinute" type="time" defaultValue={minutesToInput(property.checkInMinute)} disabled={!mayEdit} />
              </label>
              <label className="block">
                <span className="label">Check-out by</span>
                <input className="field" name="checkOutMinute" type="time" defaultValue={minutesToInput(property.checkOutMinute)} disabled={!mayEdit} />
              </label>
              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" name="featured" defaultChecked={property.featured} disabled={!mayEdit} />
                <span className="text-sm">Feature on the landing page</span>
              </label>

              <div className="sm:col-span-3">
                <TextArea label="House rules" name="houseRules" defaultValue={property.houseRules} rows={3} />
              </div>
              <div className="sm:col-span-3">
                <TextArea label="Cancellation policy" name="cancellationPolicy" defaultValue={property.cancellationPolicy} rows={2} />
              </div>
              <div className="sm:col-span-3">
                <TextArea label="What is nearby" name="nearbyAttractions" defaultValue={property.nearbyAttractions} rows={2} />
              </div>
              <div className="sm:col-span-3">
                <TextArea label="Getting there" name="transportNotes" defaultValue={property.transportNotes} rows={2} />
              </div>
              <div className="sm:col-span-3">
                <TextArea label="Parking" name="parkingNotes" defaultValue={property.parkingNotes} rows={2} />
              </div>

              <h3 className="sm:col-span-3 mt-2 font-semibold">Rates</h3>
              <Field label="Base nightly rate" name="baseRate" type="number" step="0.01" min="0" defaultValue={(property.baseRateCents / 100).toFixed(2)} />
              <Field label="Friday & Saturday rate" name="weekendRate" type="number" step="0.01" min="0" defaultValue={(property.weekendRateCents / 100).toFixed(2)} hint="Zero uses the base rate." />
              <Field label="Cleaning fee" name="cleaningFee" type="number" step="0.01" min="0" defaultValue={(property.cleaningFeeCents / 100).toFixed(2)} />
              <Field label="Extra guest fee" name="extraGuestFee" type="number" step="0.01" min="0" defaultValue={(property.extraGuestFeeCents / 100).toFixed(2)} />
              <Field label="Charged after N guests" name="extraGuestAfter" type="number" min="1" defaultValue={property.extraGuestAfter} />
              <Field label="Security deposit" name="securityDeposit" type="number" step="0.01" min="0" defaultValue={(property.securityDepositCents / 100).toFixed(2)} />
              <Field label="Minimum nights" name="minNights" type="number" min="1" defaultValue={property.minNights} />
              <Field label="Maximum nights" name="maxNights" type="number" min="1" defaultValue={property.maxNights} />

              {mayEdit && (
                <div className="sm:col-span-3">
                  <button className="btn btn-primary" type="submit">
                    Save the listing
                  </button>
                </div>
              )}
            </form>
          </Card>

          <Card title="Photos">
            {property.photos.length === 0 ? (
              <Empty>No photos. A listing without them will not sell.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {property.photos.map((p) => (
                  <figure key={p.id} className="overflow-hidden rounded-lg border border-[color:var(--color-sand-200)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.caption || property.name} className="h-32 w-full object-cover" />
                    <figcaption className="flex items-center justify-between gap-1 p-2 text-xs">
                      <span className="truncate">{p.isCover ? 'Cover' : p.caption || '—'}</span>
                      {mayEdit && (
                        <span className="flex shrink-0 gap-2">
                          {!p.isCover && (
                            <form action={photoOpAction}>
                              <input type="hidden" name="id" value={property.id} />
                              <input type="hidden" name="photoId" value={p.id} />
                              <input type="hidden" name="op" value="cover" />
                              <button className="hover:underline" type="submit">
                                Cover
                              </button>
                            </form>
                          )}
                          <form action={photoOpAction}>
                            <input type="hidden" name="id" value={property.id} />
                            <input type="hidden" name="photoId" value={p.id} />
                            <input type="hidden" name="op" value="delete" />
                            <button className="text-[color:var(--bad)] hover:underline" type="submit">
                              Remove
                            </button>
                          </form>
                        </span>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {mayEdit && (
              <form action={photoAction} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={property.id} />
                <label className="block">
                  <span className="label">Add a photo</span>
                  <input className="field" name="photo" type="file" accept="image/*" required />
                </label>
                <label className="min-w-[10rem] flex-1">
                  <span className="label">Caption</span>
                  <input className="field" name="caption" />
                </label>
                <button className="btn btn-secondary" type="submit">
                  Upload
                </button>
              </form>
            )}
          </Card>

          <Card title="Amenities">
            <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">
              Tick what this place offers — the public page groups them by category. The ★ features
              an amenity on the homepage card, which shows up to four.
            </p>
            <form action={amenitiesAction}>
              <input type="hidden" name="id" value={property.id} />
              {[...amenityGroups].map(([category, items]) => (
                <fieldset key={category} className="mb-3">
                  <legend className="label">{category}</legend>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-sm">
                        <label className="flex min-w-0 items-center gap-2">
                          <input
                            type="checkbox"
                            name="amenityIds"
                            value={a.id}
                            defaultChecked={amenityLinks.has(a.id)}
                            disabled={!mayEdit}
                          />
                          <span className="truncate">{a.name}</span>
                        </label>
                        <label
                          className="flex items-center gap-1 text-xs text-[color:var(--color-ink-500)]"
                          title="Feature on the homepage card"
                        >
                          <input
                            type="checkbox"
                            name="highlightIds"
                            value={a.id}
                            defaultChecked={amenityLinks.get(a.id) === true}
                            disabled={!mayEdit}
                          />
                          ★
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
              {mayEdit && (
                <button className="btn btn-primary" type="submit">
                  Save amenities
                </button>
              )}
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Access and Wi-Fi">
            <form action={credentialsAction} className="space-y-3">
              <input type="hidden" name="id" value={property.id} />
              <Field label="Wi-Fi network" name="wifiName" defaultValue={property.wifiName} />
              <Field label="Wi-Fi password" name="wifiPassword" defaultValue={property.wifiPassword} />
              <TextArea label="How to get in" name="accessNotes" defaultValue={property.accessNotes} rows={3} />
              <Field label="Emergency contact" name="emergencyContact" defaultValue={property.emergencyContact} />
              <p className="text-xs text-[color:var(--color-ink-500)]">
                None of this appears in an iCal feed, an export or any message before the morning
                of arrival.
              </p>
              {mayEdit && (
                <button className="btn btn-secondary" type="submit">
                  Save access details
                </button>
              )}
            </form>
          </Card>

          <Card title="Airbnb calendar">
            <p className="text-xs text-[color:var(--color-ink-500)]">
              Paste this into Airbnb to export these dates. The token is the only thing protecting
              it, so treat the URL as a password.
            </p>
            <code className="mt-2 block break-all rounded bg-[color:var(--color-sand-100)] p-2 text-xs">
              {feedUrl}
            </code>
          </Card>

          <Card title="Per-date pricing">
            {mayEdit && (
              <form action={rateAction} className="mb-4 space-y-2">
                <input type="hidden" name="id" value={property.id} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">From</span>
                    <input className="field" name="from" type="date" required />
                  </label>
                  <label className="block">
                    <span className="label">To</span>
                    <input className="field" name="to" type="date" required />
                  </label>
                </div>
                <label className="block">
                  <span className="label">Nightly rate</span>
                  <input className="field" name="rate" type="number" step="0.01" min="0" required />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="label">Minimum nights</span>
                    <input className="field" name="minNights" type="number" min="1" />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" name="closed" />
                    <span>No arrivals</span>
                  </label>
                </div>
                <label className="block">
                  <span className="label">Note</span>
                  <input className="field" name="note" placeholder="Holy Week" />
                </label>
                <button className="btn btn-secondary" type="submit">
                  Apply to those nights
                </button>
              </form>
            )}

            {property.rateOverrides.length === 0 ? (
              <Empty>Base rate everywhere.</Empty>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {property.rateOverrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatStayDate(o.date)}
                      {o.closed && <span className="ml-1 text-xs text-[color:var(--bad)]">closed</span>}
                      {o.note && (
                        <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">{o.note}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatPeso(o.nightlyRateCents)}</span>
                      {mayEdit && (
                        <form action={clearRateAction}>
                          <input type="hidden" name="id" value={property.id} />
                          <input type="hidden" name="overrideId" value={o.id} />
                          <button className="text-xs text-[color:var(--bad)] hover:underline" type="submit">
                            ×
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="At a glance">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Bookings all time</dt>
                <dd>{property._count.reservations}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Check in / out</dt>
                <dd>
                  {minutesToLabel(property.checkInMinute)} / {minutesToLabel(property.checkOutMinute)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[color:var(--color-ink-500)]">Amenities listed</dt>
                <dd>{property.amenities.length}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
