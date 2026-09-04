import Link from 'next/link';
import type { Settings } from '@/lib/settings-defaults';

/**
 * The public site's header, footer and the two floating contact buttons.
 * Server-rendered, no client JavaScript: the mobile menu is a <details>.
 */
const NAV = [
  { href: '/#templates', label: 'Templates' },
  { href: '/#packages', label: 'Packages' },
  { href: '/#how', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteHeader({ s, signedIn }: { s: Settings; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label={`${s['business.name']} — home`}>
          {s['business.logoUrl'] ? <img src={s['business.logoUrl']} alt="" className="h-9 w-auto" /> : null}
          <span className="display text-xl">{s['business.name']}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-5 text-sm md:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-[color:var(--color-plum-600)]">{n.label}</Link>)}
          {s['contact.messenger'] && <a href={s['contact.messenger']} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-[color:var(--color-plum-600)]" aria-label="Messenger"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#0084ff]" />Messenger</a>}
          <Link href={signedIn ? '/account' : '/login'} className="hover:text-[color:var(--color-plum-600)]">{signedIn ? 'My invitations' : 'Sign in'}</Link>
          <Link href="/checkout" className="btn btn-primary btn-sm">Create invitation</Link>
        </nav>
        <details className="relative md:hidden">
          <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Menu</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[color:var(--color-sand-200)] bg-white p-2 shadow-lg">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">{n.label}</Link>)}
            <Link href={signedIn ? '/account' : '/login'} className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">{signedIn ? 'My invitations' : 'Sign in'}</Link>
            <Link href="/checkout" className="btn btn-primary btn-sm mt-1 w-full">Create invitation</Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ s }: { s: Settings }) {
  return (
    <footer className="border-t border-[color:var(--color-sand-200)] bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="display text-xl">{s['business.name']}</p>
          <p className="mt-1 max-w-sm text-sm text-[color:var(--color-ink-500)]">{s['business.tagline']}. Made in the Philippines for Filipino celebrations.</p>
          <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">{s['business.address']}</p>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold">Product</p>
          <ul className="space-y-1">
            <li><Link href="/templates" className="hover:underline">Templates</Link></li>
            <li><Link href="/#packages" className="hover:underline">Packages & pricing</Link></li>
            <li><Link href="/demo" className="hover:underline">Live demo</Link></li>
            <li><Link href="/checkout?mode=DFY" className="hover:underline">Done-For-You</Link></li>
            <li><Link href="/login" className="hover:underline">Sign in</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold">Company</p>
          <ul className="space-y-1">
            {s['contact.messenger'] && <li><a href={s['contact.messenger']} className="hover:underline" target="_blank" rel="noopener">Messenger</a></li>}
            {s['contact.viber'] && <li><a href={s['contact.viber']} className="hover:underline">Viber</a></li>}
            <li><a href={`mailto:${s['business.email']}`} className="hover:underline">{s['business.email']}</a></li>
            {s['business.facebook'] && <li><a href={s['business.facebook']} className="hover:underline" target="_blank" rel="noopener">Facebook</a></li>}
            {s['business.instagram'] && <li><a href={s['business.instagram']} className="hover:underline" target="_blank" rel="noopener">Instagram</a></li>}
            <li><Link href="/terms" className="hover:underline">Terms</Link></li>
            <li><Link href="/privacy" className="hover:underline">Privacy</Link></li>
            <li><Link href="/refund-policy" className="hover:underline">Refund policy</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-[color:var(--color-sand-100)] px-5 py-4 text-center text-xs text-[color:var(--color-ink-500)]">© {new Date().getFullYear()} {s['business.name']} · One-time payment, no subscription · GCash · Maya · Cards · Bank transfer</p>
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
