import Link from 'next/link';
import type { SettingsShape } from '@/lib/settings-defaults';

/**
 * The public site's header and footer.
 *
 * The whole thing is server-rendered with no client JavaScript. The mobile menu
 * and the overflow menu are `<details>` elements, which gives keyboard support,
 * screen-reader semantics and Escape-to-close for free, and — more to the point
 * — means the navigation works on a phone that is still downloading the bundle
 * on hotel wifi.
 */

export type SiteTab = 'home' | 'stays' | 'amenities' | 'experiences' | 'gallery' | 'about' | 'contact';

const TABS: { key: SiteTab; href: string; label: string }[] = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'stays', href: '/stays', label: 'Our Stays' },
  { key: 'amenities', href: '/amenities', label: 'Amenities' },
  { key: 'experiences', href: '/experiences', label: 'Experiences' },
  { key: 'gallery', href: '/gallery', label: 'Gallery' },
  { key: 'about', href: '/about', label: 'About Us' },
  { key: 'contact', href: '/contact', label: 'Contact' },
];

function Leaf({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="17"
      height="13"
      viewBox="0 0 17 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M8.5 12V5" />
      <path d="M8.5 6.4C8.5 3.5 6.2 1.4 3 1c-.2 3.3 1.9 5.6 5.5 5.4Z" />
      <path d="M8.5 6.4C8.5 3.5 10.8 1.4 14 1c.2 3.3-1.9 5.6-5.5 5.4Z" />
    </svg>
  );
}

/**
 * The wordmark splits the business name on its last word so a two-word name
 * gets the reference's stacked treatment — "NAYRA" over "STAYS" — and a
 * one-word name simply renders without a second line rather than breaking.
 *
 * `plain` drops the leaf: when the real logo mark sits beside the text, two
 * pictograms in one lockup is one too many.
 */
function Wordmark({
  name,
  className = '',
  plain = false,
}: {
  name: string;
  className?: string;
  plain?: boolean;
}) {
  const words = name.trim().split(/\s+/);
  const tail = words.length > 1 ? words.pop()! : '';
  const head = words.join(' ');
  return (
    <span className={`wordmark ${className}`}>
      {!plain && <Leaf className="mx-auto mb-1 block opacity-80" />}
      <b>{head.toUpperCase()}</b>
      {tail && <em>{tail.toUpperCase()}</em>}
    </span>
  );
}

export function SiteHeader({ settings, active }: { settings: SettingsShape; active?: SiteTab }) {
  const tel = settings['business.phone'].replace(/\s/g, '');

  return (
    <header className="border-b border-[color:var(--color-sand-200)] bg-[color:var(--color-sand-50)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link
          href="/"
          aria-label={`${settings['business.name']} — home`}
          className="flex items-center gap-3"
        >
          {settings['business.logoUrl'] ? (
            <>
              {/* The link's aria-label already names the business, so the mark
                  is decorative here. eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings['business.logoUrl']} alt="" className="h-11 w-auto" />
              <Wordmark name={settings['business.name']} plain />
            </>
          ) : (
            <Wordmark name={settings['business.name']} />
          )}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 text-[0.8125rem] lg:flex">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? 'page' : undefined}
              className={
                active === t.key
                  ? 'border-b-[1.5px] border-[color:var(--color-clay-600)] pb-1 font-medium'
                  : 'border-b-[1.5px] border-transparent pb-1 hover:border-[color:var(--color-sand-300)]'
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/book" className="btn-brand tracked hidden sm:inline-flex">
            Book now
          </Link>

          {/* Overflow. On a phone it is the whole navigation; on a desktop it
              holds what the seven tabs deliberately leave out. */}
          <details className="group relative">
            <summary
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center"
              aria-label="More"
            >
              <span aria-hidden="true" className="flex flex-col gap-[4px]">
                <span className="block h-[1.5px] w-5 bg-[color:var(--color-ink-900)]" />
                <span className="block h-[1.5px] w-5 bg-[color:var(--color-ink-900)]" />
                <span className="block h-[1.5px] w-5 bg-[color:var(--color-ink-900)]" />
              </span>
            </summary>

            <div className="card absolute right-0 z-30 mt-2 w-60 p-2 shadow-xl">
              <nav aria-label="All pages" className="lg:hidden">
                {TABS.map((t) => (
                  <Link
                    key={t.key}
                    href={t.href}
                    aria-current={active === t.key ? 'page' : undefined}
                    className={`block rounded px-3 py-2.5 text-sm hover:bg-[color:var(--color-sand-100)] ${
                      active === t.key ? 'font-medium text-[color:var(--color-clay-600)]' : ''
                    }`}
                  >
                    {t.label}
                  </Link>
                ))}
                <hr className="my-2 border-[color:var(--color-sand-200)]" />
              </nav>

              <Link href="/book" className="block rounded px-3 py-2.5 text-sm hover:bg-[color:var(--color-sand-100)] sm:hidden">
                Book now
              </Link>
              <a
                href={`tel:${tel}`}
                className="block rounded px-3 py-2.5 text-sm hover:bg-[color:var(--color-sand-100)]"
              >
                Call {settings['business.phone']}
              </a>
              <a
                href={`mailto:${settings['business.email']}`}
                className="block rounded px-3 py-2.5 text-sm hover:bg-[color:var(--color-sand-100)]"
              >
                Email us
              </a>
              <Link
                href="/manage"
                className="block rounded px-3 py-2.5 text-sm hover:bg-[color:var(--color-sand-100)]"
              >
                Manage my booking
              </Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: SettingsShape }) {
  const tel = settings['business.phone'].replace(/\s/g, '');

  return (
    <footer className="bg-[color:var(--color-clay-600)] text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {settings['business.logoFooterUrl'] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings['business.logoFooterUrl']}
              alt={settings['business.name']}
              className="h-36 w-auto"
            />
          ) : (
            <Wordmark name={settings['business.name']} className="text-white" />
          )}
          <p className="mt-4 text-white/70">{settings['business.address']}</p>
        </div>

        <div>
          <p className="tracked mb-3 text-white/60">Visit</p>
          <ul className="space-y-1.5">
            {TABS.filter((t) => t.key !== 'home').map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="text-white/85 hover:text-white hover:underline">
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="tracked mb-3 text-white/60">Talk to us</p>
          <ul className="space-y-1.5">
            <li>
              <a className="text-white/85 hover:text-white hover:underline" href={`mailto:${settings['business.email']}`}>
                {settings['business.email']}
              </a>
            </li>
            <li>
              <a className="text-white/85 hover:text-white hover:underline" href={`tel:${tel}`}>
                {settings['business.phone']}
              </a>
            </li>
            <li>
              <Link href="/manage" className="text-white/85 hover:text-white hover:underline">
                Manage my booking
              </Link>
            </li>
            {settings['business.facebook'] && (
              <li>
                <a className="text-white/85 hover:text-white hover:underline" href={settings['business.facebook']}>
                  Facebook
                </a>
              </li>
            )}
            {settings['business.instagram'] && (
              <li>
                <a className="text-white/85 hover:text-white hover:underline" href={settings['business.instagram']}>
                  Instagram
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <p className="tracked mb-3 text-white/60">Good to know</p>
          <p className="text-white/70">{settings['booking.cancellationPolicy']}</p>
        </div>
      </div>

      {/* No staff sign-in link anywhere public: staff go straight to /login,
          which is noindex'd. Advertising the staff entrance on a booking site
          invites password guessing and helps nobody who belongs there. */}
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} {settings['business.name']}. Built and run in Manila.
          </p>
        </div>
      </div>
    </footer>
  );
}
