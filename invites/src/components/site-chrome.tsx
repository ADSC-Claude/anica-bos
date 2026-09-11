import Link from 'next/link';
import type { Settings } from '@/lib/settings-defaults';

/**
 * The public site's header, footer and the two floating contact buttons.
 * Server-rendered, no client JavaScript: the mobile menu is a <details>.
 *
 * There is no "Sign in" anywhere on the public chrome, deliberately. A visitor
 * who has not bought anything has nothing to sign in to, and the only accounts
 * that exist are staff ones — an invitation to sign in is an invitation to try.
 * /login still serves; it is reached by typing it, and by the links in the
 * emails that send a customer back to their own invitation. Somebody who IS
 * signed in still gets a way back to theirs, which is what this link is now.
 */
const NAV = [
  { href: '/#templates', label: 'Templates' },
  { href: '/occasions', label: 'By occasion' },
  { href: '/#packages', label: 'Packages' },
  { href: '/#how', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
];

/**
 * The wordmark, at the size the header was built around.
 *
 * The full stacked lockup and nothing beside it. The name used to sit next to
 * the mark as type, which is what a mark-only logo wants — but this logo has
 * the word in it already, and printing "Invited" twice beside itself is the
 * one thing a header must not do. The alt text carries the name for anybody
 * who cannot see the image.
 */
function Wordmark({ s }: { s: Settings }) {
  // The file in the repo is the default rather than something an operator has
  // to go and configure, so a fresh deploy has the logo rather than a gap.
  // business.logoUrl still wins where it is set, which is what that setting is
  // for — swapping the mark without a deploy.
  return <img src={s['business.logoUrl'] || '/logo.png'} alt={s['business.name']} className="h-12 w-auto md:h-14" />;
}

function Arrow() {
  return (
    <svg className="ed-arrow" width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
      <path d="M1 5h13M10 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader({ s, signedIn }: { s: Settings; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" aria-label={`${s['business.name']} — home`}>
          <Wordmark s={s} />
        </Link>
        <nav aria-label="Main" className="ed-nav hidden items-center gap-8 lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
          {signedIn && <Link href="/account">My invitations</Link>}
        </nav>
        <div className="hidden items-center gap-4 lg:flex">
          <Link href="/checkout" className="ed-cta ed-cta-outline">Create invitation<Arrow /></Link>
        </div>
        <details className="relative lg:hidden">
          <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Menu</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[color:var(--color-sand-200)] bg-white p-2 shadow-lg">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">{n.label}</Link>)}
            {signedIn && <Link href="/account" className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">My invitations</Link>}
            {s['contact.messenger'] && <a href={s['contact.messenger']} target="_blank" rel="noopener" className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">Messenger</a>}
            <Link href="/checkout" className="btn btn-primary btn-sm mt-1 w-full">Create invitation</Link>
          </div>
        </details>
      </div>
    </header>
  );
}

/** One social mark. Outline only — four filled brand colours in a footer pull
 *  harder than anything above them, and none of them is ours. */
function Social({ href, label, d }: { href: string; label: string; d: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" aria-label={label} title={label}
       className="text-[color:var(--color-ink-500)] transition-colors hover:text-[color:var(--color-wine-800)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={d} /></svg>
    </a>
  );
}

const IG = 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.8-.1zm0 3.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2zm0 10.9a4.3 4.3 0 1 1 0-8.6 4.3 4.3 0 0 1 0 8.6zm8.4-11.2a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z';
const FB = 'M22 12a10 10 0 1 0-11.6 9.9v-7h-2.5V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z';

export function SiteFooter({ s }: { s: Settings }) {
  return (
    <footer className="border-t border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)]">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label={`${s['business.name']} — home`}>
            <Wordmark s={s} />
          </Link>

          <nav aria-label="Footer" className="ed-nav flex flex-wrap items-center gap-x-7 gap-y-2">
            <Link href="/templates">Templates</Link>
            <Link href="/#packages">Pricing</Link>
            <Link href="/occasions">By occasion</Link>
            <Link href="/#how">How it works</Link>
            <a href={`mailto:${s['business.email']}`}>Contact</a>
          </nav>

          <div className="flex items-center gap-5">
            {s['business.instagram'] && <Social href={s['business.instagram']} label="Instagram" d={IG} />}
            {s['business.facebook'] && <Social href={s['business.facebook']} label="Facebook" d={FB} />}
            <span aria-hidden className="hidden h-px w-8 bg-[color:var(--color-sand-300)] sm:block" />
            <span className="ed-eyebrow">Made with love</span>
          </div>
        </div>

        {/* The small print stays. It is the part a customer actually needs
            when something has gone wrong, and an editorial footer is not a
            reason to make the refund policy harder to find. */}
        <div className="mt-10 flex flex-col gap-3 border-t border-[color:var(--color-sand-200)] pt-6 text-xs text-[color:var(--color-ink-500)] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {s['business.name']} · One-time payment, no subscription · GCash · Maya · Cards · Bank transfer</p>
          <p className="flex flex-wrap gap-4">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/refund-policy" className="hover:underline">Refunds</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

/** The two buttons that follow the visitor down every public page. */
export function FloatingContact({ s }: { s: Settings }) {
  if (!s['contact.messenger'] && !s['contact.viber']) return null;
  return (
    <div className="fixed bottom-4 right-4 z-30 flex flex-col gap-2 print:hidden">
      {s['contact.messenger'] && <a href={s['contact.messenger']} target="_blank" rel="noopener" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0084ff] text-white shadow-lg" aria-label="Chat on Messenger" title="Messenger"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.2S17.5 2 12 2zm1 12.4-2.6-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.4 5.8z" /></svg></a>}
      {s['contact.viber'] && <a href={s['contact.viber']} className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7360f2] text-white shadow-lg" aria-label="Chat on Viber" title="Viber"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2C7 2 3 5.5 3 10.3c0 2.6 1.2 4.9 3.1 6.4V22l3.5-2.1c.8.2 1.6.3 2.4.3 5 0 9-3.5 9-8.3S17 2 12 2zm3.9 12.3c-.2.5-1.1 1-1.6 1.1-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.3-.5-2.3-1-3.8-3.3-3.9-3.5-.1-.2-.9-1.2-.9-2.3s.6-1.6.8-1.8c.2-.2.4-.3.6-.3h.4c.1 0 .3 0 .5.4.2.4.6 1.5.7 1.6.1.1.1.2 0 .4l-.3.4-.3.3c-.1.1-.2.2-.1.4.1.2.6 1 1.2 1.6.8.7 1.5 1 1.7 1.1.2.1.3.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.1 1.1z" /></svg></a>}
    </div>
  );
}
