import Link from 'next/link';
import { requireSessionPage } from '@/lib/guard';
import { visibleModules } from '@/lib/rbac';
import { unreadCount } from '@/lib/notifications';
import { listBranches } from '@/lib/settings';
import { logoutAction } from './actions';
import { PortalNav } from '@/components/portal-nav';
import { BranchSwitcher } from '@/components/branch-switcher';

export const dynamic = 'force-dynamic';

/** Nothing behind the sign-in belongs in a search index. */
export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionPage();
  const modules = visibleModules(user.role);
  const unread = await unreadCount(user);
  const branches = await listBranches();

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50 lg:flex-row">
      {/* Desktop sidebar — the reception desk computer */}
      <aside className="hidden w-60 shrink-0 border-r border-sand-200 bg-white lg:flex lg:flex-col no-print">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cocoa-600 text-lg text-white">
            ✿
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-cocoa-800">ANICA</p>
            <p className="text-[11px] text-cocoa-400">Wellness Spa BOS</p>
          </div>
        </div>
        <PortalNav modules={modules} unread={unread} variant="sidebar" />
        <div className="mt-auto border-t border-sand-200 p-4">
          <p className="truncate text-sm font-semibold text-cocoa-700">{user.name}</p>
          <p className="mb-3 text-[11px] uppercase tracking-wide text-cocoa-400">
            {user.role.toLowerCase()}
          </p>
          {branches.length > 1 && user.role === 'OWNER' && (
            <div className="mb-3">
              <BranchSwitcher branches={branches} />
            </div>
          )}
          <Link
            href="/portal/change-password"
            className="mb-2 block text-center text-[11px] text-cocoa-500 underline underline-offset-4"
          >
            Change my password
          </Link>
          <form action={logoutAction}>
            <button className="btn-secondary btn-sm w-full" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar — the owner's phone */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sand-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden no-print">
        <Link href="/portal" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cocoa-600 text-white">
            ✿
          </span>
          <span className="font-display text-sm font-semibold text-cocoa-800">ANICA</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-sand-200 text-cocoa-600"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          >
            ⌾
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay-500 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <Link
            href="/portal/change-password"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand-200 text-cocoa-600"
            aria-label="Change my password"
            title="Change my password"
          >
            ✳
          </Link>
          <form action={logoutAction}>
            <button className="btn-secondary btn-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <PortalNav modules={modules} unread={unread} variant="bottom" />
    </div>
  );
}
