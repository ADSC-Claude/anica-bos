'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { Wordmark } from '@/components/landing/wordmark';

/**
 * The landing page's own header: dark, so the hero photo runs under it, and
 * collapsed to a mark and a menu on a phone.
 *
 * The links are passed in rather than listed here, because two of the sections
 * are conditional — membership disappears with no published packages, guests
 * with no released testimonials — and a nav item that scrolls nowhere is the
 * kind of fault nobody reports and everybody quietly distrusts.
 */
export type NavLink = { href: string; label: string };

export function SiteHeader({
  name,
  logoUrl,
  links,
}: {
  name: string;
  logoUrl: string;
  links: NavLink[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-cocoa-800/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <BrandMark logoUrl={logoUrl} size={34} />
          <Wordmark name={name} tone="light" />
        </Link>

        <nav
          className={`${
            open ? 'block' : 'hidden'
          } absolute inset-x-0 top-full border-b border-white/10 bg-cocoa-800 px-4 pb-5 pt-1 lg:static lg:block lg:border-0 lg:bg-transparent lg:p-0`}
        >
          <ul className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-7">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-2.5 text-[11px] uppercase tracking-[0.17em] text-sand-100
                             hover:text-white lg:py-0"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          {/* Hidden on a phone: the bar pinned to the bottom of the screen is
              already offering exactly this, and two of them is noise. */}
          <Link href="/book" className="btn-primary btn-sm hidden rounded-full px-5 sm:inline-flex">
            Book now
          </Link>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="p-2 lg:hidden"
          >
            <span className="sr-only">Menu</span>
            <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-white" fill="none" strokeWidth={1.6}>
              {open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
