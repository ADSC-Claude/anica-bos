import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { upsertGuest } from '@/lib/guests';
import { notify } from '@/lib/notifications';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { PageHero, Icon } from '@/components/site-ui';
import { Notice } from '@/components/ui';

export const metadata = { title: 'Contact' };
export const dynamic = 'force-dynamic';

/**
 * The contact form.
 *
 * An enquiry is a booking that hasn't happened yet, so it is not filed as
 * email — it goes into the CRM as a guest with a note against them, and raises
 * an alert on the dashboard. That means the next person to open the portal
 * sees it, it survives someone leaving, and if that person books later their
 * first contact is already on their record.
 *
 * Defences, in order of how much they matter for a form with no login:
 *   • A honeypot field real people never see and never fill.
 *   • Everything length-capped before it reaches the database.
 *   • Marketing consent is opt-in and unticked, because the alternative is
 *     illegal under the Data Privacy Act and rude besides.
 */

async function submitEnquiry(formData: FormData) {
  'use server';

  // Bots fill every field they find. This one is hidden from people and from
  // screen readers, so anything in it is not a person.
  if (String(formData.get('website') ?? '').trim()) {
    redirect('/contact?done=1');
  }

  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  const email = String(formData.get('email') ?? '').trim().slice(0, 200);
  const mobile = String(formData.get('mobile') ?? '').trim().slice(0, 40);
  const subject = String(formData.get('subject') ?? '').trim().slice(0, 120);
  const message = String(formData.get('message') ?? '').trim().slice(0, 4000);
  const consent = formData.get('consent') === 'on';

  const fail = (why: string) => redirect(`/contact?error=${encodeURIComponent(why)}`);

  if (!name) fail('Please tell us your name.');
  if (!email && !mobile) fail('Please leave an email address or a mobile number so we can reply.');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('That email address does not look right.');
  if (message.length < 10) fail('Please tell us a little more about what you need.');

  const [firstName, ...rest] = name.split(/\s+/);

  const guestId = await prisma.$transaction(async (tx) => {
    const guest = await upsertGuest(tx, {
      firstName,
      lastName: rest.join(' '),
      email,
      mobile,
      marketingConsent: consent,
    });
    await tx.guestNote.create({
      data: {
        guestId: guest.id,
        kind: 'ENQUIRY',
        body: [subject && `Subject: ${subject}`, message].filter(Boolean).join('\n\n'),
      },
    });
    return guest.id;
  });

  await notify({
    kind: 'ENQUIRY',
    severity: 'INFO',
    title: `Enquiry from ${name}${subject ? ` — ${subject}` : ''}`,
    body: message.slice(0, 240),
    link: `/portal/guests/${guestId}`,
    // Keyed on the guest and the message so a person who writes twice about two
    // different things gets two alerts, and a double-submitted form gets one.
    dedupeKey: `enquiry:${guestId}:${message.slice(0, 60)}`,
    roles: ['OWNER', 'MANAGER', 'RESERVATIONS'],
  });

  redirect('/contact?done=1');
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const settings = await getSettings();
  const { done, error } = await searchParams;

  const branches = await prisma.branch.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      properties: {
        where: { status: 'ACTIVE' },
        select: { name: true, slug: true },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      },
    },
  });

  const tel = settings['business.phone'].replace(/\s/g, '');

  return (
    <>
      <SiteHeader settings={settings} active="contact" />

      <PageHero
        eyebrow="Get in touch"
        title="Ask us anything before you book"
        intro="A real person reads these, usually within the day. If it's urgent, ring — that's faster than any form."
      />

      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
          {/* --- the form ------------------------------------------------ */}
          <section>
            {done ? (
              <div className="card p-8">
                <h2 className="display text-2xl">Thank you — that&rsquo;s with us.</h2>
                <p className="mt-3 text-[color:var(--color-ink-500)]">
                  We&rsquo;ll come back to you at the address or number you left, usually the same day.
                  If you&rsquo;d rather not wait, ring{' '}
                  <a href={`tel:${tel}`} className="font-medium text-[color:var(--color-clay-600)] underline">
                    {settings['business.phone']}
                  </a>
                  .
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/stays" className="btn-brand tracked">
                    Browse our stays
                  </Link>
                  <Link
                    href="/contact"
                    className="tracked inline-flex items-center justify-center border border-[color:var(--color-sand-300)] px-7 py-[0.95rem] hover:bg-[color:var(--color-sand-100)]"
                  >
                    Send another
                  </Link>
                </div>
              </div>
            ) : (
              <form action={submitEnquiry} className="card p-7 sm:p-8">
                <h2 className="display mb-6 text-2xl">Send us a message</h2>

                {error && (
                  <div className="mb-6">
                    <Notice kind="error">{error}</Notice>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="label">Your name</span>
                    <input name="name" className="field" required maxLength={120} autoComplete="name" />
                  </label>

                  <label className="block">
                    <span className="label">Email</span>
                    <input
                      name="email"
                      type="email"
                      className="field"
                      maxLength={200}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="label">Mobile</span>
                    <input
                      name="mobile"
                      type="tel"
                      className="field"
                      maxLength={40}
                      autoComplete="tel"
                      placeholder="09XX XXX XXXX"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="label">What&rsquo;s it about?</span>
                    <select name="subject" className="field" defaultValue="A booking">
                      <option>A booking</option>
                      <option>Dates and availability</option>
                      <option>Long stays and monthly rates</option>
                      <option>Something I need in the flat</option>
                      <option>A stay I&rsquo;ve already booked</option>
                      <option>Something else</option>
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="label">Your message</span>
                    <textarea
                      name="message"
                      className="field"
                      required
                      rows={6}
                      maxLength={4000}
                      minLength={10}
                      placeholder="Dates you have in mind, how many of you, anything you need us to know."
                    />
                  </label>
                </div>

                {/* Honeypot. Hidden from sight and from assistive technology, so
                    only an automated submitter ever finds it. */}
                <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <label className="mt-6 flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="consent"
                    className="mt-0.5"
                    style={{ minHeight: 'unset', width: '1rem', height: '1rem' }}
                  />
                  <span className="text-[color:var(--color-ink-500)]">
                    Send me the occasional note about openings and off-season rates. One click to leave,
                    any time.
                  </span>
                </label>

                <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
                  {settings['booking.termsNote']}
                </p>

                <button type="submit" className="btn-brand tracked mt-7 w-full sm:w-auto">
                  Send message
                </button>
              </form>
            )}
          </section>

          {/* --- the details --------------------------------------------- */}
          <aside className="space-y-8">
            <div>
              <p className="eyebrow mb-4">Reach us directly</p>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-[color:var(--color-clay-600)]">{Icon.person({ size: 20 })}</span>
                  <span>
                    <a href={`tel:${tel}`} className="font-medium hover:underline">
                      {settings['business.phone']}
                    </a>
                    <span className="block text-[color:var(--color-ink-500)]">
                      Fastest, and there is someone on the end of it.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-[color:var(--color-clay-600)]">{Icon.direct({ size: 20 })}</span>
                  <span>
                    <a href={`mailto:${settings['business.email']}`} className="font-medium hover:underline">
                      {settings['business.email']}
                    </a>
                    <span className="block text-[color:var(--color-ink-500)]">
                      For anything with an attachment.
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 text-[color:var(--color-clay-600)]">{Icon.pin({ size: 20 })}</span>
                  <span className="text-[color:var(--color-ink-500)]">{settings['business.address']}</span>
                </li>
              </ul>
            </div>

            {branches.length > 0 && (
              <div className="border-t border-[color:var(--color-sand-200)] pt-8">
                <p className="eyebrow mb-4">Where our places are</p>
                <ul className="space-y-5 text-sm">
                  {branches.map((b) => (
                    <li key={b.id}>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-[color:var(--color-ink-500)]">
                        {b.city}
                        {b.province ? `, ${b.province}` : ''}
                      </p>
                      {b.properties.length > 0 && (
                        <p className="mt-1.5 text-[color:var(--color-ink-500)]">
                          {b.properties.map((p, i) => (
                            <span key={p.slug}>
                              {i > 0 && ' · '}
                              <Link href={`/stays/${p.slug}`} className="hover:underline">
                                {p.name}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-[color:var(--color-sand-200)] pt-8">
              <p className="eyebrow mb-3">Already booked?</p>
              <p className="text-sm text-[color:var(--color-ink-500)]">
                Your confirmation email has a link to your stay — dates, door code and balance, all in one
                place.
              </p>
              <Link
                href="/manage"
                className="mt-3 inline-block text-sm font-medium text-[color:var(--color-clay-600)] underline"
              >
                Manage my booking
              </Link>
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}
