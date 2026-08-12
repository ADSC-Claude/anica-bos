import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatStayRange } from '@/lib/datetime';
import { notify } from '@/lib/notifications';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { Card, Notice } from '@/components/ui';

export const metadata = { title: 'How was your stay?', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Review submission from the emailed link. The token is single-use in the sense
 * that matters: once a review exists for the reservation the form is replaced
 * by a thank-you, so a forwarded link cannot be used to stuff the page.
 *
 * A review arrives unpublished. Somebody decides what goes on the public site —
 * not the sender of the last HTTP request.
 */

const TAGS = ['Cleanliness', 'Location', 'Value', 'Comfort', 'Communication', 'Amenities', 'Check-in'];

async function submitAction(formData: FormData) {
  'use server';
  const token = String(formData.get('token'));

  const reservation = await prisma.reservation.findUnique({
    where: { reviewToken: token },
    include: {
      guest: { select: { id: true, firstName: true, lastName: true } },
      property: { select: { id: true, name: true } },
      reviews: { select: { id: true } },
    },
  });
  if (!reservation) redirect('/');
  if (reservation.reviews.length > 0) redirect(`/review/${token}?done=1`);

  const rating = Number(formData.get('rating') ?? 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect(`/review/${token}?error=${encodeURIComponent('Please choose a rating from one to five.')}`);
  }

  const review = await prisma.review.create({
    data: {
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      guestId: reservation.guestId,
      platform: 'DIRECT',
      guestName: `${reservation.guest.firstName} ${reservation.guest.lastName}`.trim(),
      rating,
      title: String(formData.get('title') ?? '').slice(0, 120),
      body: String(formData.get('body') ?? '').slice(0, 4000),
      stayDate: reservation.checkIn,
      tags: formData.getAll('tags').map(String),
      published: false,
    },
  });

  await notify({
    kind: 'NEW_REVIEW',
    severity: rating <= 3 ? 'HIGH' : 'INFO',
    title: `${rating}★ review for ${reservation.property.name}`,
    body: String(formData.get('body') ?? '').slice(0, 200),
    link: `/portal/reviews`,
    dedupeKey: `review:${review.id}`,
    roles: rating <= 3 ? ['OWNER', 'MANAGER'] : ['MANAGER'],
    propertyId: reservation.propertyId,
  });

  redirect(`/review/${token}?done=1`);
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const settings = await getSettings();

  const reservation = await prisma.reservation.findUnique({
    where: { reviewToken: token },
    include: {
      guest: { select: { firstName: true } },
      property: { select: { name: true } },
      reviews: { select: { id: true, rating: true } },
    },
  });
  if (!reservation) notFound();

  const already = reservation.reviews.length > 0 || sp.done;

  return (
    <div className="min-h-screen bg-[color:var(--color-sand-50)]">
      <SiteHeader settings={settings} />

      <main className="mx-auto max-w-xl px-5 py-12">
        {already ? (
          <Card title="Thank you">
            <p className="text-sm">
              Your review has been received. It genuinely helps — and if anything fell short, we
              would rather hear it from you than read it somewhere else. You can always reach us on{' '}
              <a className="underline" href={`tel:${settings['business.phone'].replace(/\s/g, '')}`}>
                {settings['business.phone']}
              </a>
              .
            </p>
          </Card>
        ) : (
          <>
            <h1 className="display mb-1 text-3xl font-bold">
              How was {reservation.property.name}, {reservation.guest.firstName}?
            </h1>
            <p className="mb-6 text-[color:var(--color-ink-500)]">
              {formatStayRange(reservation.checkIn, reservation.checkOut)}
            </p>

            {sp.error && <Notice kind="error">{sp.error}</Notice>}

            <Card>
              <form action={submitAction} className="space-y-4">
                <input type="hidden" name="token" value={token} />

                <fieldset>
                  <legend className="label">Overall *</legend>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label
                        key={n}
                        className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-lg border border-[color:var(--color-sand-300)] py-2 text-center hover:bg-[color:var(--color-sand-100)] has-[:checked]:border-[color:var(--color-clay-500)] has-[:checked]:bg-[color:var(--color-sand-100)]"
                      >
                        <input className="sr-only" type="radio" name="rating" value={n} required />
                        <span aria-hidden className="text-lg">
                          {'★'.repeat(n)}
                        </span>
                        <span className="text-xs">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="label">What stood out?</legend>
                  <div className="flex flex-wrap gap-2">
                    {TAGS.map((t) => (
                      <label
                        key={t}
                        className="cursor-pointer rounded-full border border-[color:var(--color-sand-300)] px-3 py-1 text-sm hover:bg-[color:var(--color-sand-100)] has-[:checked]:border-[color:var(--color-clay-500)] has-[:checked]:bg-[color:var(--color-sand-100)]"
                      >
                        <input className="sr-only" type="checkbox" name="tags" value={t} />
                        {t}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="label">Headline</span>
                  <input className="field" name="title" maxLength={120} placeholder="A quiet flat, five minutes from everything" />
                </label>

                <label className="block">
                  <span className="label">Tell us more</span>
                  <textarea className="field" name="body" rows={5} maxLength={4000} />
                </label>

                <button className="btn btn-primary w-full" type="submit">
                  Send my review
                </button>

                <p className="text-xs text-[color:var(--color-ink-500)]">
                  We read every one. Nothing appears on the site until we have read it.
                </p>
              </form>
            </Card>
          </>
        )}
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}
