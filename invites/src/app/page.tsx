import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { catalogue } from '@/lib/orders';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS, TIER_LABELS, COMPARISON } from '@/lib/tiers';
import { appUrl } from '@/lib/app-url';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { PhoneOpening } from '@/components/landing/phone-demo';
import { TemplateGallery } from '@/components/landing/gallery';
import { galleryWithPeeks } from '@/lib/peek';
import { PREMIUM_OPENING_CODE } from '@/lib/openings';
import { Packages } from '@/components/landing/packages';
import { ContactButtons } from '@/components/ui';
import { imageUrl, IMAGE } from '@/lib/images';
import { Figure, PHOTO } from '@/components/landing/figure';

export const dynamic = 'force-dynamic';

/** The arrow that trails every call to action. Drawn rather than a character:
 *  → sits on the text baseline at whatever weight the font feels like. */
function Arrow() {
  return (
    <svg className="ed-arrow" width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
      <path d="M1 5h13M10 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The four promises above the fold's fold, each with a thin line icon. */
const PROMISES: { title: string; body: string; path: string }[] = [
  { title: 'Elegant designs', body: 'Beautiful templates for every occasion.', path: 'M6 3h8l4 4v14H6zM14 3v4h4' },
  { title: 'Easy RSVP management', body: 'All your responses in one place.', path: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 8a2.5 2.5 0 1 1 0 5M16 20a5 5 0 0 0-1-3' },
  { title: 'Share in seconds', body: 'Send by link, QR code or Messenger.', path: 'M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z' },
  { title: 'Made for everyone', body: 'No app, no account — it opens on any phone.', path: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z' },
];


const FAQ = [
  { q: 'Can I pay with GCash?', a: 'Yes. GCash, Maya, credit or debit card and online banking go through PayMongo and confirm instantly. You can also transfer directly to our GCash or bank account and upload the screenshot — a person verifies it within a few hours during business hours.' },
  { q: 'Do my guests need an app or an account?', a: 'No. The invitation is a link. It opens in Messenger, Viber, any browser, on any phone — no download, no sign-up. RSVP is one tap.' },
  { q: 'Can my lola open it?', a: 'That is exactly who we built it for. Big text, big buttons, loads fast on mobile data, and there is a “Download as image” button so you can forward a picture version to relatives who prefer that.' },
  { q: 'Can I print it?', a: 'Yes. Every invitation has a print view (Save as PDF from your phone or laptop) and a downloadable image with a QR code that opens the full invitation.' },
  { q: 'Can I change details after publishing?', a: 'Message us and we will sort it out. Most of the changing happens before we publish: you review a preview and tell us what to fix, with two rounds included. After it is live, guests always see the latest version at the same link — there is nothing for them to re-download.' },
  { q: 'Do I have to design or build anything?', a: 'No. Pick a package and a design, pay, and then send us the details however is easiest — our form, Messenger, Viber or an Excel file. Photos and screenshots are fine. An encoder builds it in 7 to 10 working days — an estimate, not a queue, so if yours is ready sooner you get it sooner — you review a preview on your phone, ask for changes (two rounds included), approve, and we publish.' },
  { q: 'What is the refund policy?', a: 'Because each invitation is built to order, payments are non-refundable once published or once our team has started building it. If we cannot deliver, you get a full refund.' },
  { q: 'Is my guest list safe?', a: 'Guest lists are personal data. We collect only what an invitation needs, never sell or share it, and keep personal links unguessable. Your dashboard has a Your data page that downloads everything we hold about you and deletes all of it on request — in line with the Data Privacy Act of 2012.' },
];

const TESTIMONIALS = [
  { name: 'Bea & Miguel', event: 'Wedding · Tagaytay', quote: 'Our ninongs and ninangs got their own links with their names on it. The titas were so impressed. RSVP was done in a week — no more chasing on Messenger.', photo: 'https://picsum.photos/seed/bea/160/160' },
  { name: 'Tita Joy', event: 'Debut · Quezon City', quote: 'I had zero time. Sent everything on Viber, got the preview a few days later, approved it, done. Sulit.', photo: 'https://picsum.photos/seed/joy/160/160' },
  { name: 'Carlo & Ana', event: 'Binyag + 1st Birthday · Cebu', quote: 'The GCash QR on the gift note was a game changer. And it loaded fine on my dad’s old Samsung.', photo: 'https://picsum.photos/seed/carlo/160/160' },
];

export default async function Landing() {
  const s = await getSettings();
  if (s['site.comingSoon']) redirect('/coming-soon');
  const [session, { packages, addOns }, templates] = await Promise.all([
    getSession(),
    catalogue(),
    prisma.template.findMany({ where: { published: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }] }),
  ]);
  // the design whose opening the phone plays: the featured one with a clip
  const flagship = templates.find((t) => t.openingVideoUrl && t.openingPosterUrl) ?? null;
  const weddingPackages = TIERS.map((t) => packages.find((p) => p.occasion === 'WEDDING' && p.tier === t) ?? packages.find((p) => p.occasion === null && p.tier === t)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: s['business.name'],
    url: appUrl(),
    description: s['business.intro'],
    address: { '@type': 'PostalAddress', addressCountry: 'PH', addressLocality: s['business.address'] },
    offers: weddingPackages.map((p) => ({ '@type': 'Offer', name: p.name, price: (p.priceCents / 100).toFixed(2), priceCurrency: 'PHP' })),
  };

  return (
    <>
      <SiteHeader s={s} signedIn={Boolean(session)} />
      <main>
        {/* Hero */}
        <section className="ed-section">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              <span className="ed-eyebrow ed-eyebrow-ruled block">More than an invitation</span>
              <h1 className="ed-display ed-display-xl mt-7 text-balance">Beautiful beginnings start here.</h1>
              <p className="mt-7 max-w-md text-lg leading-relaxed text-[color:var(--color-ink-700)]">
                Create elegant digital invitations for life&rsquo;s most meaningful moments — with one-tap RSVP, a QR code, and nothing for your guests to download.
              </p>
              <div className="mt-10">
                <Link href="/checkout" className="ed-cta">Create your invitation<Arrow /></Link>
              </div>
              <p className="mt-6 text-sm text-[color:var(--color-ink-500)]">One-time payment · GCash / Maya · No app needed for guests</p>
            </div>

            {/* The photograph, and beside it the line the mockup runs up the
                right-hand edge. On a phone that rail would be a column of
                single words, so it only appears once there is room for it. */}
            <div className="flex items-stretch gap-6">
              {/* The alcove, with the phone standing in it.

                  The mockup photographs a phone on marble; we have something
                  better than a photograph of a phone, which is a phone playing
                  the actual premium opening. So the arch is the set and the
                  live demo is what stands in it — and the moment a real
                  photograph arrives it takes the same slot with the phone
                  still in front of it. */}
              <Figure src={PHOTO.hero} alt="" arch className="flex-1 place-items-center px-6 py-10 sm:px-10">
                {flagship
                  ? <div className="relative w-full max-w-[15rem]"><PhoneOpening src={flagship.openingVideoUrl} poster={flagship.openingPosterUrl} name={flagship.name} /></div>
                  : null}
              </Figure>
              <p className="ed-eyebrow hidden self-center whitespace-nowrap xl:block" style={{ writingMode: 'vertical-rl' }}>
                Timeless invitations for modern celebrations
              </p>
            </div>
          </div>
        </section>

        {/* The occasions, numbered. Four, not the mockup's five: corporate
            events are not on sale yet, and a storefront that lists something
            it cannot take an order for is a storefront that wastes a click. */}
        <section className="border-y border-[color:var(--color-sand-200)] bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-16 gap-y-8 px-5 py-10 text-center">
            {OCCASIONS.filter((o) => o.phase === 1).map((o, i) => (
              <Link key={o.key} href={`/occasions/${o.key.toLowerCase().replace(/_/g, '-')}`} className="group">
                <span className="ed-numbered block tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="ed-eyebrow mt-2 block text-[color:var(--color-ink-900)] transition-colors group-hover:text-[color:var(--color-wine-800)]">{o.label}</span>
                <span aria-hidden className="ed-numbered-rule mx-auto mt-3 block" />
              </Link>
            ))}
          </div>
        </section>

        {/* Invitations made simple */}
        <section className="ed-section">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-20">
            <Figure src={PHOTO.card} alt="" className="min-h-[20rem] sm:min-h-[26rem]" />
            <div>
              <span className="ed-eyebrow ed-eyebrow-ruled block">Effortlessly elegant</span>
              <h2 className="ed-display ed-display-lg mt-7">Invitations<br />Made Simple</h2>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-[color:var(--color-ink-700)]">
                Designed to celebrate what matters, without the hassle. You send us the details however is easiest — our form, Messenger, Viber, even a photo of a list — and we build it.
              </p>
              <Link href="/#templates" className="ed-link mt-10 w-full max-w-xs">Explore templates<Arrow /></Link>
            </div>
          </div>
        </section>

        {/* The four promises */}
        <section className="border-y border-[color:var(--color-sand-200)] bg-white">
          <div className="ed-divided mx-auto grid max-w-6xl gap-0 px-5 py-14 md:grid-cols-4">
            {PROMISES.map((f) => (
              <div key={f.title} className="text-center">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="mx-auto text-[color:var(--color-wine-800)]" aria-hidden>
                  <path d={f.path} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 className="ed-eyebrow mt-5 text-[color:var(--color-ink-900)]">{f.title}</h3>
                <p className="mx-auto mt-3 max-w-[15rem] text-sm leading-relaxed text-[color:var(--color-ink-700)]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What we take, kept from the old trust bar. Not decoration: "can I
            pay with GCash" is the first question anybody asks. */}
        <section className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs uppercase tracking-[0.16em] text-[color:var(--color-ink-500)]">
            <span className="text-[#0070e0]">GCash</span><span className="text-[#00a651]">Maya</span><span>Visa · Mastercard</span><span>BPI · BDO · UnionBank</span><span>Made in the Philippines</span>
            {s['business.invitesCreatedLabel'] && <span>{s['business.invitesCreatedLabel']} invitations created</span>}
            {s['business.rsvpsCollectedLabel'] && <span>{s['business.rsvpsCollectedLabel']} RSVPs collected</span>}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="ed-section mx-auto max-w-6xl px-5">
          <span className="ed-eyebrow ed-eyebrow-ruled is-centred block text-center">How it works</span>
          <h2 className="ed-display ed-display-lg mt-6 text-center">From payment to published</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-[color:var(--color-ink-500)]">You do not have to build anything. Every package is encoded by our team — you tell us the details and approve it before your guests see it.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { title: 'Pick and pay', sub: 'A few minutes', steps: ['Choose the occasion, a package and a design', 'Pay with GCash, Maya, card or a bank transfer'] },
              { title: 'Tell us the details', sub: 'At your own pace', steps: ['Fill in one form — names, entourage, venues, photos, RSVP', 'Or send them over Messenger, Viber or Excel; screenshots are fine'] },
              { title: 'We build it', sub: '7 to 10 working days, usually less', steps: ['An encoder lays out your invitation on the design you chose', 'We prepare the photos and the music so it opens the way it should'] },
              { title: 'Approve and share', sub: 'Two rounds of changes', steps: ['Review a preview on your phone and tell us what to change', 'We publish; you share the link and QR on Messenger, Viber or SMS'] },
            ].map((flow) => (
              <div key={flow.title} className="card p-6">
                <h3 className="display text-2xl">{flow.title}</h3>
                <p className="text-sm text-[color:var(--color-ink-500)]">{flow.sub}</p>
                <ol className="mt-4 space-y-3">{flow.steps.map((st, i) => <li key={i} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-plum-600)] text-sm font-semibold text-white">{i + 1}</span><span className="text-sm">{st}</span></li>)}</ol>
              </div>
            ))}
          </div>
        </section>

        {/* Templates */}
        <section id="templates" className="ed-section bg-white">
          <div className="mx-auto max-w-6xl px-5">
            <span className="ed-eyebrow ed-eyebrow-ruled is-centred block text-center">Templates</span>
            <h2 className="ed-display ed-display-lg mt-6 text-center">Our designs</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-[color:var(--color-ink-700)]">Each design is shown by its cover — the first page your guest sees. The pages under it are unveiled for our clients once they have chosen; the premium opening video is an add-on. More designs, for {OCCASIONS.filter((o) => o.phase === 1).map((o) => o.label.toLowerCase()).join(', ')} and beyond, are on the way.</p>
            <div className="mt-8">
              <TemplateGallery compact templates={await galleryWithPeeks(templates)} premiumPriceCents={addOns.find((a) => a.code === PREMIUM_OPENING_CODE && a.active)?.priceCents} />
            </div>
          </div>
        </section>

        {/* Packages */}
        <section id="packages" className="ed-section bg-white">
          <div className="mx-auto max-w-6xl px-5">
            <span className="ed-eyebrow ed-eyebrow-ruled is-centred block text-center">Packages</span>
            <h2 className="ed-display ed-display-lg mt-6 text-center">Simple pricing, paid once</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[color:var(--color-ink-700)]">Wedding pricing shown. Debut, christening and birthday packages follow the same three tiers; pick your occasion at checkout to see its price.</p>
            <div className="mt-8">
              <Packages packages={weddingPackages.map((p) => ({ tier: p.tier, name: p.name, tagline: p.tagline, priceCents: p.priceCents, dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents, revisionRounds: p.revisionRounds, linkValidityDays: p.linkValidityDays }))} addOns={addOns.map((a) => ({ code: a.code, name: a.name, description: a.description, imageUrl: a.imageUrl, priceCents: a.priceCents, quoted: a.quoted }))} />
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="ed-section mx-auto max-w-6xl px-5">
          <h2 className="ed-display ed-display-lg text-center">Everything, side by side</h2>
          <div className="card mt-6 overflow-x-auto">
            <table className="data min-w-[40rem]">
              <thead><tr><th>Feature</th>{TIERS.map((t) => <th key={t}>{TIER_LABELS[t]}</th>)}</tr></thead>
              <tbody>{COMPARISON.map((r) => <tr key={r.label}><td>{r.label}</td>{TIERS.map((t) => <td key={t}>{typeof r.cells[t] === 'boolean' ? (r.cells[t] ? <span className="text-[color:var(--ok)]">✓</span> : <span className="text-[color:var(--color-ink-500)]">—</span>) : r.cells[t]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        {/* Feature highlights */}
        <section className="ed-section bg-white">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="ed-display ed-display-lg text-center">Built around how Filipino events really work</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Per-guest links', '“Dear Mr. & Mrs. Dela Cruz, we have reserved 2 seats for you.” Each guest sees their own name, seats and table — never anyone else’s.'],
                ['RSVP dashboard', 'Who accepted, how many seats, meal choices, dietary notes, messages — and an Excel export for the caterer.'],
                ['Entourage section', 'Principal sponsors in paired columns, secondary sponsors for candle, veil and cord, the whole wedding party. Unlimited rows.'],
                ['GCash QR gift note', 'A gracious preset note (“Your presence is the greatest gift…”), your GCash QR and bank details. Tagalog version included.'],
                ['Guest photos', 'After the day, guests upload their own photos to your page — you approve what shows.'],
                ['Messenger-ready', 'Loads fast on mobile data, renders inside the Messenger and Viber browsers, and the link preview shows your photo and names.'],
              ].map(([t, d]) => <div key={t} className="card p-5"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-[color:var(--color-ink-700)]">{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="ed-section mx-auto max-w-6xl px-5">
          <h2 className="ed-display ed-display-lg text-center">From couples and celebrants</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="card p-5">
                <blockquote className="text-sm">“{t.quote}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-3"><img src={imageUrl(t.photo, IMAGE.avatar)} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" /><span><span className="block text-sm font-semibold">{t.name}</span><span className="block text-xs text-[color:var(--color-ink-500)]">{t.event}</span></span></figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-[color:var(--color-ink-500)]">Sample testimonials — replace with your own in the code once you have them.</p>
        </section>

        {/* FAQ */}
        <section id="faq" className="ed-section bg-white">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="ed-display ed-display-lg text-center">Questions people ask us on Messenger</h2>
            <div className="mt-8 space-y-2">
              {FAQ.map((f) => <details key={f.q} className="card p-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{f.a}</p></details>)}
            </div>
          </div>
        </section>

        {/* The closing band.

            Dark, full-bleed, and the only place on the page where the wine is
            the ground rather than the accent — which is what makes it read as
            an ending rather than one more section. The contact buttons stay
            inside it: somebody who has scrolled this far and still has not
            clicked usually has a question, not an objection. */}
        <section className="ed-band">
          <div className="ed-band-media" aria-hidden>
            {PHOTO.band ? <img src={PHOTO.band} alt="" loading="lazy" /> : null}
          </div>
          <div className="ed-band-inner mx-auto max-w-6xl px-5 py-20 md:py-28">
            <span aria-hidden className="mb-8 block h-px w-10 bg-white/40" />
            <h2 className="ed-display ed-display-lg max-w-2xl text-white">
              Life&rsquo;s special moments deserve a beautiful invitation.
            </h2>
            {/* hoursNote already names the channels and the hours, so the
                lead-in must not: the two together used to say "Messenger and
                Viber" twice in one breath. */}
            <p className="mt-6 max-w-md text-white/70">
              Start now, or send us a message. {s['contact.hoursNote']}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-8">
              <Link href="/checkout" className="ed-link w-full max-w-xs">Start creating today<Arrow /></Link>
            </div>
            <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} className="mt-10" />
          </div>
        </section>

      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
