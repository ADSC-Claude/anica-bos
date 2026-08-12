import Link from 'next/link';
import type { SettingsShape } from '@/lib/settings-defaults';

/** `overlay` floats it over the landing hero; everywhere else it sits solid. */
export function SiteHeader({ settings, overlay }: { settings: SettingsShape; overlay?: boolean }) {
  return (
    <header
      className={
        overlay
          ? 'absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 text-white'
          : 'flex items-center justify-between border-b border-[color:var(--color-sand-200)] bg-white px-5 py-4'
      }
    >
      <Link href="/" className="display text-lg font-bold drop-shadow">
        {settings['business.name']}
      </Link>
      <nav className="flex items-center gap-4 text-sm drop-shadow">
        <Link href="/stays" className="hover:underline">
          Stays
        </Link>
        <Link href="/#faq" className="hidden hover:underline sm:inline">
          FAQ
        </Link>
        <a href={`tel:${settings['business.phone'].replace(/\s/g, '')}`} className="hover:underline">
          Contact
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: SettingsShape }) {
  return (
    <footer className="border-t border-[color:var(--color-sand-200)] bg-white px-5 py-8">
      <div className="mx-auto grid max-w-5xl gap-6 text-sm sm:grid-cols-3">
        <div>
          <p className="display text-base font-bold">{settings['business.name']}</p>
          <p className="text-[color:var(--color-ink-500)]">{settings['business.address']}</p>
        </div>
        <div>
          <p className="font-semibold">Talk to us</p>
          <p>
            <a className="hover:underline" href={`mailto:${settings['business.email']}`}>
              {settings['business.email']}
            </a>
          </p>
          <p>
            <a className="hover:underline" href={`tel:${settings['business.phone'].replace(/\s/g, '')}`}>
              {settings['business.phone']}
            </a>
          </p>
          <p className="mt-1 flex gap-3">
            {settings['business.facebook'] && (
              <a className="hover:underline" href={settings['business.facebook']}>
                Facebook
              </a>
            )}
            {settings['business.instagram'] && (
              <a className="hover:underline" href={settings['business.instagram']}>
                Instagram
              </a>
            )}
          </p>
        </div>
        <div>
          <p className="font-semibold">Good to know</p>
          <p className="text-[color:var(--color-ink-500)]">{settings['booking.cancellationPolicy']}</p>
          <Link href="/login" className="mt-2 inline-block text-xs hover:underline">
            Staff sign-in
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-5xl text-xs text-[color:var(--color-ink-500)]">
        © {new Date().getFullYear()} {settings['business.name']}. Built and run in Manila.
      </p>
    </footer>
  );
}
