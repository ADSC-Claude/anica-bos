import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { catalogue } from '@/lib/orders';
import { OCCASIONS } from '@/lib/occasions';
import { TIERS, TIER_LABELS, COMPARISON } from '@/lib/tiers';
import { paletteFrom } from '@/lib/theme';
import { appUrl } from '@/lib/app-url';
import { SiteHeader, SiteFooter, FloatingContact } from '@/components/site-chrome';
import { PhoneDemo } from '@/components/landing/phone-demo';
import { TemplateGallery } from '@/components/landing/gallery';
import { Packages } from '@/components/landing/packages';
import { ContactButtons } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FAQ = [
  { q: 'Can I pay with GCash?', a: 'Yes. GCash, Maya, credit or debit card and online banking go through PayMongo and confirm instantly. You can also transfer directly to our GCash or bank account and upload the screenshot — a person verifies it within a few hours during business hours.' },
  { q: 'Do my guests need an app or an account?', a: 'No. The invitation is a link. It opens in Messenger, Viber, any browser, on any phone — no download, no sign-up. RSVP is one tap.' },
  { q: 'Can my lola open it?', a: 'That is exactly who we built it for. Big text, big buttons, loads fast on mobile data, and there is a “Download as image” button so you can forward a picture version to relatives who prefer that.' },
  { q: 'Can I print it?', a: 'Yes. Every invitation has a print view (Save as PDF from your phone or laptop) and a downloadable image with a QR code that opens the full invitation.' },
  { q: 'Can I change details after publishing?', a: 'Standard and Complete packages include unlimited edits until the event. Basic includes three. Guests always see the latest version at the same link.' },
  { q: 'How does Done-For-You work?', a: 'Pick a package, tick Done-For-You, pay. Then send us the details however is easiest — our intake form, Messenger, Viber or an Excel file. An encoder builds it in 2–3 working days, you review a preview, request changes (2 rounds included), approve, and we publish. You can still edit it yourself afterwards.' },
  { q: 'What is the refund policy?', a: 'Because each invitation is built to order, payments are non-refundable once published or once a Done-For-You build has started. If we cannot deliver, you get a full refund.' },
  { q: 'Is my guest list safe?', a: 'Guest lists are personal data. We collect only what an invitation needs, never sell or share it, and keep personal links unguessable. Your dashboard has a Your data page that downloads everything we hold about you and deletes all of it on request — in line with the Data Privacy Act of 2012.' },
];

const TESTIMONIALS = [
  { name: 'Bea & Miguel', event: 'Wedding · Tagaytay', quote: 'Our ninongs and ninangs got their own links with their names on it. The titas were so impressed. RSVP was done in a week — no more chasing on Messenger.', photo: 'https://picsum.photos/seed/bea/160/160' },
  { name: 'Tita Joy', event: 'Debut · Quezon City', quote: 'We chose Done-For-You because I had zero time. Sent everything on Viber, got the preview two days later, approved it, done. Sulit.', photo: 'https://picsum.photos/seed/joy/160/160' },
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
  const demo = `/i/${s['site.demoSlug']}`;
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
            <p className="mt-5 max-w-xl text-lg text-[color:var(--color-ink-700)]">A beautiful link and QR for your wedding, debut, binyag or birthday — with the full entourage, Google Maps and Waze buttons, a GCash gift QR and one-tap RSVP. Build it yourself in minutes, or let us encode it for you.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/checkout" className="btn btn-primary">Create your invitation</Link>
              <Link href="/checkout?mode=DFY" className="btn btn-secondary">Let us do it for you</Link>
            </div>
            <p className="mt-4 text-sm text-[color:var(--color-ink-500)]">One-time payment · GCash / Maya · No app needed for guests · <a href={demo} target="_blank" rel="noopener" className="underline">See the live demo</a></p>
          </div>
          <PhoneDemo src={demo} />
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
          <h2 className="display mt-2 text-center text-3xl">Two ways to get there</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              { title: 'Do it yourself', sub: 'Instant, unlimited edits', steps: ['Pick a template and package, pay with GCash, Maya or card', 'Fill in a guided builder — names, entourage, venues, photos, RSVP — with a live phone preview', 'Publish and share your link and QR on Messenger, Viber or SMS'] },
              { title: 'Done-For-You', sub: 'We encode it · 2–3 working days', steps: ['Pick a package, tick Done-For-You, pay', 'Send the details by intake form, Messenger, Viber or Excel — photos and screenshots welcome', 'Review a preview on your phone, request tweaks, approve — we publish'] },
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
            <h2 className="display mt-2 text-center text-3xl">Designs for every Filipino celebration</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-[color:var(--color-ink-700)]">{OCCASIONS.filter((o) => o.phase === 1).map((o) => o.label).join(', ')} at launch — with {OCCASIONS.filter((o) => o.phase > 1).length} more occasions from milestone birthdays to memorials.</p>
            <div className="mt-8">
              <TemplateGallery compact demoSlug={s['site.demoSlug']} templates={templates.map((t) => { const p = paletteFrom(t.palette); return { id: t.id, slug: t.slug, name: t.name, occasion: t.occasion, minTier: t.minTier, premium: t.premium, description: t.description, thumbnailUrl: t.thumbnailUrl, layout: t.layout, palette: { bg: p.bg, accent: p.accent, accent2: p.accent2, ink: p.ink }, featured: t.featured }; })} />
            </div>
          </div>
        </section>

        {/* Live demo */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="card flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
            <div>
              <p className="eyebrow">Live demo</p>
              <h2 className="display mt-1 text-2xl">Open “Juan & Maria” on your phone</h2>
              <p className="mt-1 max-w-xl text-sm text-[color:var(--color-ink-700)]">A complete wedding invitation: parents, the full entourage with ninongs and ninangs, dress code swatches, a GCash gift note, story, gallery, FAQ and a working RSVP. Try it — responses on the demo are not kept.</p>
            </div>
            <a href={demo} target="_blank" rel="noopener" className="btn btn-primary">Open the demo</a>
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
                ['Seating & check-in', 'Assign tables, show each guest theirs, and check people in at the door by scanning their QR.'],
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
                <figcaption className="mt-4 flex items-center gap-3"><img src={t.photo} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" /><span><span className="block text-sm font-semibold">{t.name}</span><span className="block text-xs text-[color:var(--color-ink-500)]">{t.event}</span></span></figcaption>
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
          <p className="mx-auto mt-3 max-w-xl text-[color:var(--color-ink-700)]">Start building now, or send us a message — we answer on Messenger and Viber. {s['contact.hoursNote']}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/checkout" className="btn btn-primary">Create your invitation</Link>
            <Link href="/checkout?mode=DFY" className="btn btn-secondary">Let us do it for you</Link>
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
