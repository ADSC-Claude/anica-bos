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

export const dynamic = 'force-dynamic';

const FAQ = [
  { q: 'Can I pay with GCash?', a: 'Yes. GCash, Maya, credit or debit card and online banking go through PayMongo and confirm instantly. You can also transfer directly to our GCash or bank account and upload the screenshot — a person verifies it within a few hours during business hours.' },
  { q: 'Do my guests need an app or an account?', a: 'No. The invitation is a link. It opens in Messenger, Viber, any browser, on any phone — no download, no sign-up. RSVP is one tap.' },
  { q: 'Can my lola open it?', a: 'That is exactly who we built it for. Big text, big buttons, loads fast on mobile data, and there is a “Download as image” button so you can forward a picture version to relatives who prefer that.' },
  { q: 'Can I print it?', a: 'Yes. Every invitation has a print view (Save as PDF from your phone or laptop) and a downloadable image with a QR code that opens the full invitation.' },
  { q: 'Can I change details after publishing?', a: 'Message us and we will sort it out. Most of the changing happens before we publish: you review a preview and tell us what to fix, with two rounds included. After it is live, guests always see the latest version at the same link — there is nothing for them to re-download.' },
  { q: 'Do I have to design or build anything?', a: 'No. Pick a package and a design, pay, and then send us the details however is easiest — our form, Messenger, Viber or an Excel file. Photos and screenshots are fine. An encoder builds it in five working days to a week, you review a preview on your phone, ask for changes (two rounds included), approve, and we publish.' },
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
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-[1fr_auto] md:py-20">
          <div>
            <p className="eyebrow mb-3">Digital invitations · Philippines</p>
            <h1 className="display text-balance text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">The invitation your guests will actually open.</h1>
            <p className="mt-5 max-w-xl text-lg text-[color:var(--color-ink-700)]">A beautiful link and QR for your wedding, debut, binyag or birthday — with the full entourage, Google Maps and Waze buttons, a GCash gift QR and one-tap RSVP. You tell us the details; we build it and you approve it before anyone sees it.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/checkout" className="btn btn-primary">Create your invitation</Link>
              <Link href="#how" className="btn btn-secondary">See how it works</Link>
            </div>
            <p className="mt-4 text-sm text-[color:var(--color-ink-500)]">One-time payment · GCash / Maya · No app needed for guests</p>
          </div>
          {flagship && <PhoneOpening src={flagship.openingVideoUrl} poster={flagship.openingPosterUrl} name={flagship.name} />}
        </section>

        {/* Trust bar */}
        <section className="border-y border-[color:var(--color-sand-200)] bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)]">
            <span className="text-[#0070e0]">GCash</span><span className="text-[#00a651]">Maya</span><span>Visa · Mastercard</span><span>BPI · BDO · UnionBank</span><span>🇵🇭 Made in the Philippines</span>
            {s['business.invitesCreatedLabel'] && <span>{s['business.invitesCreatedLabel']} invitations created</span>}
            {s['business.rsvpsCollectedLabel'] && <span>{s['business.rsvpsCollectedLabel']} RSVPs collected</span>}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 py-16">
          <p className="eyebrow text-center">How it works</p>
          <h2 className="display mt-2 text-center text-3xl">From payment to published</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-[color:var(--color-ink-500)]">You do not have to build anything. Every package is encoded by our team — you tell us the details and approve it before your guests see it.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              { title: 'Pick and pay', sub: 'A few minutes', steps: ['Choose the occasion, a package and a design', 'Pay with GCash, Maya, card or a bank transfer'] },
              { title: 'Tell us the details', sub: 'At your own pace', steps: ['Fill in one form — names, entourage, venues, photos, RSVP', 'Or send them over Messenger, Viber or Excel; screenshots are fine'] },
              { title: 'We build it', sub: 'Five working days to a week', steps: ['An encoder lays out your invitation on the design you chose', 'We prepare the photos and the music so it opens the way it should'] },
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
        <section id="templates" className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-5">
            <p className="eyebrow text-center">Templates</p>
            <h2 className="display mt-2 text-center text-3xl">Our designs</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-[color:var(--color-ink-700)]">Each design is shown by its cover — the first page your guest sees. The pages under it are unveiled for our clients once they have chosen; the premium opening video is an add-on. More designs, for {OCCASIONS.filter((o) => o.phase === 1).map((o) => o.label.toLowerCase()).join(', ')} and beyond, are on the way.</p>
            <div className="mt-8">
              <TemplateGallery compact templates={await galleryWithPeeks(templates)} premiumPriceCents={addOns.find((a) => a.code === PREMIUM_OPENING_CODE && a.active)?.priceCents} />
            </div>
          </div>
        </section>

        {/* Packages */}
        <section id="packages" className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-5">
            <p className="eyebrow text-center">Packages</p>
            <h2 className="display mt-2 text-center text-3xl">Simple pricing, paid once</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[color:var(--color-ink-700)]">Wedding pricing shown. Debut, christening and birthday packages follow the same three tiers; pick your occasion at checkout to see its price.</p>
            <div className="mt-8">
              <Packages packages={weddingPackages.map((p) => ({ tier: p.tier, name: p.name, tagline: p.tagline, priceCents: p.priceCents, dfyFeeCents: p.dfyFeeCents, conciergeFeeCents: p.conciergeFeeCents, editsAfterPublish: p.editsAfterPublish, linkValidityDays: p.linkValidityDays }))} addOns={addOns.map((a) => ({ code: a.code, name: a.name, description: a.description, priceCents: a.priceCents, quoted: a.quoted }))} />
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="display text-center text-3xl">Everything, side by side</h2>
          <div className="card mt-6 overflow-x-auto">
            <table className="data min-w-[40rem]">
              <thead><tr><th>Feature</th>{TIERS.map((t) => <th key={t}>{TIER_LABELS[t]}</th>)}</tr></thead>
              <tbody>{COMPARISON.map((r) => <tr key={r.label}><td>{r.label}</td>{TIERS.map((t) => <td key={t}>{typeof r.cells[t] === 'boolean' ? (r.cells[t] ? <span className="text-[color:var(--ok)]">✓</span> : <span className="text-[color:var(--color-ink-500)]">—</span>) : r.cells[t]}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>

        {/* Feature highlights */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="display text-center text-3xl">Built around how Filipino events really work</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Per-guest links', '“Dear Mr. & Mrs. Dela Cruz, we have reserved 2 seats for you.” Each guest sees their own name, seats and table — never anyone else’s.'],
                ['RSVP dashboard', 'Who accepted, how many seats, meal choices, dietary notes, messages — and an Excel export for the caterer.'],
                ['Entourage section', 'Principal sponsors in paired columns, secondary sponsors for candle, veil and cord, the whole wedding party. Unlimited rows.'],
                ['GCash QR gift note', 'A gracious preset note (“Your presence is the greatest gift…”), your GCash QR and bank details. Tagalog version included.'],
                ['Guest photos', 'After the day, guests upload their own photos and videos to your page — you approve what shows.'],
                ['Messenger-ready', 'Loads fast on mobile data, renders inside the Messenger and Viber browsers, and the link preview shows your photo and names.'],
              ].map(([t, d]) => <div key={t} className="card p-5"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-[color:var(--color-ink-700)]">{d}</p></div>)}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="display text-center text-3xl">From couples and celebrants</h2>
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
        <section id="faq" className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-5">
            <h2 className="display text-center text-3xl">Questions people ask us on Messenger</h2>
            <div className="mt-8 space-y-2">
              {FAQ.map((f) => <details key={f.q} className="card p-4"><summary className="cursor-pointer font-semibold">{f.q}</summary><p className="mt-2 text-sm text-[color:var(--color-ink-700)]">{f.a}</p></details>)}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="display text-3xl sm:text-4xl">Ready when you are.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[color:var(--color-ink-700)]">Start now, or send us a message — we answer on Messenger and Viber. {s['contact.hoursNote']}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/checkout" className="btn btn-primary">Create your invitation</Link>
            <Link href="#how" className="btn btn-secondary">See how it works</Link>
          </div>
          <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} className="mt-4 justify-center" />
        </section>
      </main>
      <SiteFooter s={s} />
      <FloatingContact s={s} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
