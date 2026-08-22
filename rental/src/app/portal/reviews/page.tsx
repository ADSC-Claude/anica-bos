import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { audit } from '@/lib/audit';
import { resolveNotification } from '@/lib/notifications';
import { Card, Empty, Notice, PageHeader, Pill, Stat } from '@/components/ui';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/reviews?${kind}=${encodeURIComponent(message)}`);
}

async function respondAction(formData: FormData) {
  'use server';
  const user = await requirePage('reviews.respond');
  const id = String(formData.get('id'));
  const response = String(formData.get('response') ?? '').trim();

  const review = await prisma.review.findUnique({ where: { id }, select: { propertyId: true } });
  if (!review) back('That review no longer exists.', 'error');
  await assertProperty(user, review.propertyId);

  await prisma.review.update({
    where: { id },
    data: {
      response,
      respondedAt: response ? new Date() : null,
      respondedById: response ? user.id : null,
    },
  });
  await audit(user, {
    module: 'reviews',
    action: 'respond',
    entityType: 'Review',
    entityId: id,
    propertyId: review.propertyId,
    summary: 'Review responded to',
  });
  back('Response saved.');
}

async function publishAction(formData: FormData) {
  'use server';
  const user = await requirePage('reviews.respond');
  const id = String(formData.get('id'));
  const field = String(formData.get('field'));

  const review = await prisma.review.findUnique({
    where: { id },
    select: { propertyId: true, published: true, featured: true },
  });
  if (!review) back('That review no longer exists.', 'error');
  await assertProperty(user, review.propertyId);

  const next = field === 'featured' ? !review.featured : !review.published;
  await prisma.review.update({
    where: { id },
    // Featuring something unpublished would put it on the site by a side door,
    // so featuring publishes it too.
    data:
      field === 'featured'
        ? { featured: next, published: next ? true : review.published }
        : { published: next, featured: next ? review.featured : false },
  });
  await resolveNotification(`review:${id}`);

  await audit(user, {
    module: 'reviews',
    action: field === 'featured' ? 'feature' : 'publish',
    entityType: 'Review',
    entityId: id,
    propertyId: review.propertyId,
    summary: `Review ${field} set to ${next}`,
  });
  back(next ? 'Now showing on the public site.' : 'Taken off the public site.');
}

async function addExternalAction(formData: FormData) {
  'use server';
  const user = await requirePage('reviews.respond');
  const propertyId = String(formData.get('propertyId') ?? '');
  const rating = Number(formData.get('rating') ?? 0);
  if (!propertyId || rating < 1 || rating > 5) back('A property and a rating are required.', 'error');
  await assertProperty(user, propertyId);

  const review = await prisma.review.create({
    data: {
      propertyId,
      platform: String(formData.get('platform') || 'AIRBNB') as never,
      guestName: String(formData.get('guestName') ?? ''),
      rating,
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
      tags: [],
    },
  });
  await audit(user, {
    module: 'reviews',
    action: 'import',
    entityType: 'Review',
    entityId: review.id,
    propertyId,
    summary: 'Review recorded from another platform',
  });
  back('Recorded.');
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; platform?: string; rating?: string }>;
}) {
  const user = await requirePage('reviews.view');
  const sp = await searchParams;
  const mayRespond = can(user.role, 'reviews.respond');
  const propertyIds = await visibleProperties(user);

  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};
  const [reviews, all, properties] = await Promise.all([
    prisma.review.findMany({
      where: {
        ...scope,
        ...(sp.platform ? { platform: sp.platform as never } : {}),
        ...(sp.rating === 'low' ? { rating: { lte: 3 } } : {}),
      },
      include: { property: { select: { name: true } }, guest: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.review.findMany({ where: scope, select: { rating: true, tags: true, respondedAt: true } }),
    prisma.property.findMany({
      where: propertyIds ? { id: { in: propertyIds } } : {},
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const average = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;
  const unanswered = all.filter((r) => !r.respondedAt).length;

  // What keeps coming up, good and bad. A tag on a 4- or 5-star review is a
  // compliment; the same tag on a 1- to 3-star one is a complaint.
  const themes = new Map<string, { good: number; bad: number }>();
  for (const r of all) {
    for (const tag of r.tags) {
      const entry = themes.get(tag) ?? { good: 0, bad: 0 };
      if (r.rating >= 4) entry.good++;
      else entry.bad++;
      themes.set(tag, entry);
    }
  }
  const ranked = [...themes.entries()].sort((a, b) => b[1].good + b[1].bad - (a[1].good + a[1].bad));

  return (
    <>
      <PageHeader title="Reviews" subtitle={`${all.length} in total`} />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Average rating" value={average ? average.toFixed(2) : '—'} hint="out of 5" />
        <Stat label="Reviews" value={all.length} />
        <Stat
          label="Awaiting a reply"
          value={unanswered}
          tone={unanswered > 0 ? 'bad' : undefined}
        />
        <Stat label="Published" value={reviews.filter((r) => r.published).length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex flex-wrap gap-2" method="get">
            <select className="field w-auto" name="platform" defaultValue={sp.platform ?? ''}>
              <option value="">Every platform</option>
              <option value="DIRECT">Direct</option>
              <option value="AIRBNB">Airbnb</option>
              <option value="GOOGLE">Google</option>
              <option value="OTHER">Other</option>
            </select>
            <select className="field w-auto" name="rating" defaultValue={sp.rating ?? ''}>
              <option value="">Any rating</option>
              <option value="low">Three stars or fewer</option>
            </select>
            <button className="btn btn-secondary" type="submit">
              Filter
            </button>
          </form>

          {reviews.length === 0 ? (
            <Empty>No reviews yet.</Empty>
          ) : (
            reviews.map((r) => (
              <Card key={r.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-lg" aria-label={`${r.rating} out of 5`}>
                      {'★'.repeat(r.rating)}
                      <span className="text-[color:var(--color-sand-300)]">
                        {'★'.repeat(5 - r.rating)}
                      </span>
                    </span>
                    <span className="ml-2 text-sm font-medium">{r.guestName || 'Guest'}</span>
                    <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">
                      {r.property.name} · {r.platform.toLowerCase()} · {formatManila(r.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.published && <Pill tone="ok">on the site</Pill>}
                    {r.featured && <Pill tone="warn">featured</Pill>}
                  </div>
                </div>

                {r.title && <p className="font-semibold">{r.title}</p>}
                {r.body && <p className="whitespace-pre-wrap text-sm">{r.body}</p>}
                {r.tags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[color:var(--color-sand-100)] px-2 py-0.5 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </p>
                )}

                {r.response && (
                  <div className="mt-3 border-l-2 border-[color:var(--color-clay-500)] pl-3">
                    <p className="text-xs text-[color:var(--color-ink-500)]">
                      Our reply · {r.respondedAt ? formatManila(r.respondedAt) : ''}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{r.response}</p>
                  </div>
                )}

                {mayRespond && (
                  <div className="mt-3 space-y-2 border-t border-[color:var(--color-sand-200)] pt-3">
                    <form action={respondAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="min-w-[14rem] flex-1">
                        <span className="label">{r.response ? 'Edit the reply' : 'Reply'}</span>
                        <input className="field" name="response" defaultValue={r.response} />
                      </label>
                      <button className="btn btn-secondary" type="submit">
                        Save
                      </button>
                    </form>
                    <div className="flex gap-2">
                      <form action={publishAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="field" value="published" />
                        <button className="text-xs hover:underline" type="submit">
                          {r.published ? 'Take off the site' : 'Show on the site'}
                        </button>
                      </form>
                      <form action={publishAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="field" value="featured" />
                        <button className="text-xs hover:underline" type="submit">
                          {r.featured ? 'Unfeature' : 'Feature'}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card title="What keeps coming up">
            {ranked.length === 0 ? (
              <Empty>Not enough reviews yet.</Empty>
            ) : (
              <ul className="space-y-1 text-sm">
                {ranked.map(([tag, counts]) => (
                  <li key={tag} className="flex items-center justify-between">
                    <span>{tag}</span>
                    <span className="tabular-nums text-xs">
                      <span className="text-[color:var(--ok)]">{counts.good} good</span>
                      {counts.bad > 0 && (
                        <span className="ml-2 text-[color:var(--bad)]">{counts.bad} poor</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {mayRespond && (
            <Card title="Record a review from elsewhere">
              <form action={addExternalAction} className="space-y-3">
                <label className="block">
                  <span className="label">Property *</span>
                  <select className="field" name="propertyId" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Platform</span>
                  <select className="field" name="platform" defaultValue="AIRBNB">
                    <option value="AIRBNB">Airbnb</option>
                    <option value="GOOGLE">Google</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Guest name</span>
                  <input className="field" name="guestName" />
                </label>
                <label className="block">
                  <span className="label">Rating *</span>
                  <select className="field" name="rating" defaultValue="5">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} star{n === 1 ? '' : 's'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Headline</span>
                  <input className="field" name="title" />
                </label>
                <label className="block">
                  <span className="label">Review</span>
                  <textarea className="field" name="body" rows={3} />
                </label>
                <button className="btn btn-secondary" type="submit">
                  Record
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
