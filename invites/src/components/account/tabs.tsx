'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { currentTab, type Tab } from '@/lib/account-tabs';

/**
 * The strip. On a laptop every tab is in view; on a phone the row scrolls
 * sideways and the current tab is brought into view on arrival, so the
 * customer always sees where they are and what is next to it.
 */
export function TabStrip({ tabs, base }: { tabs: Tab[]; base: string }) {
  const pathname = usePathname();
  const current = currentTab(tabs, pathname, base);
  const ref = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);
  return (
    <nav aria-label="Tools" data-tour="tabs" className="-mx-5 mb-5 overflow-x-auto border-b border-[color:var(--color-sand-200)] px-5">
      <ul className="flex min-w-max gap-1 text-sm">
        {tabs.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                ref={on ? ref : undefined}
                href={t.href}
                aria-current={on ? 'page' : undefined}
                title={t.locked ? 'Not in your package yet' : undefined}
                data-tour={t.key === 'guide' ? 'guide' : undefined}
                className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 ${on ? 'border-[color:var(--color-plum-600)] font-semibold text-[color:var(--color-plum-600)]' : 'border-transparent text-[color:var(--color-ink-700)] hover:border-[color:var(--color-sand-300)] hover:text-[color:var(--color-ink-900)]'} ${t.locked ? 'text-[color:var(--color-ink-500)]' : ''}`}
              >
                {t.label}
                {t.locked && <span className="pill pill-warn text-[10px]">Upgrade</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
