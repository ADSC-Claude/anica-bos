'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Mod = { key: string; label: string; href: string; icon: string };

function isActive(pathname: string, href: string) {
  if (href === '/portal') return pathname === '/portal';
  return pathname === href || pathname.startsWith(href + '/');
}

export function PortalNav({
  modules,
  unread,
  variant,
}: {
  modules: readonly Mod[];
  unread: number;
  variant: 'sidebar' | 'bottom';
}) {
  const pathname = usePathname() ?? '/portal';

  if (variant === 'sidebar') {
    return (
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {modules.map((m) => {
          const active = isActive(pathname, m.href);
          return (
            <Link
              key={m.key}
              href={m.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? 'bg-cocoa-600 text-white' : 'text-cocoa-700 hover:bg-sand-100'
              }`}
            >
              <span aria-hidden className="w-5 text-center opacity-80">
                {m.icon}
              </span>
              {m.label}
            </Link>
          );
        })}
        <Link
          href="/portal/notifications"
          className={`mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            isActive(pathname, '/portal/notifications')
              ? 'bg-cocoa-600 text-white'
              : 'text-cocoa-700 hover:bg-sand-100'
          }`}
        >
          <span aria-hidden className="w-5 text-center opacity-80">
            ⌾
          </span>
          Notifications
          {unread > 0 && (
            <span className="ml-auto rounded-full bg-clay-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>
        <Link
          href="/portal/messages"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            isActive(pathname, '/portal/messages')
              ? 'bg-cocoa-600 text-white'
              : 'text-cocoa-700 hover:bg-sand-100'
          }`}
        >
          <span aria-hidden className="w-5 text-center opacity-80">
            ✉
          </span>
          Messages
        </Link>
      </nav>
    );
  }

  // Bottom bar: the five most-used modules for the current role.
  const primary = modules.slice(0, 5);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-sand-200 bg-white/97 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden no-print">
      {primary.map((m) => {
        const active = isActive(pathname, m.href);
        return (
          <Link
            key={m.key}
            href={m.href}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${
              active ? 'text-cocoa-700' : 'text-cocoa-400'
            }`}
          >
            <span aria-hidden className="text-base">
              {m.icon}
            </span>
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
