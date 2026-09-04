import Link from 'next/link';
import { requireCustomerPage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { unreadCount } from '@/lib/notifications';
import { isStaff } from '@/lib/rbac';
import { logoutAction } from '@/app/login/actions';
import { ContactButtons } from '@/components/ui';

export const metadata = { robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomerPage();
  const [s, unread] = await Promise.all([getSettings(), unreadCount(user.id)]);
  return (
    <div className="min-h-dvh bg-[color:var(--color-sand-50)]">
      <header className="border-b border-[color:var(--color-sand-200)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link href="/account" className="display text-xl">{s['business.name']}</Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <Link href="/account" className="rounded-lg px-3 py-2 hover:bg-[color:var(--color-sand-100)]">My invitations</Link>
            <Link href="/account/orders" className="rounded-lg px-3 py-2 hover:bg-[color:var(--color-sand-100)]">Orders</Link>
            <Link href="/account/support" className="rounded-lg px-3 py-2 hover:bg-[color:var(--color-sand-100)]">Help</Link>
            <Link href="/account/privacy" className="rounded-lg px-3 py-2 hover:bg-[color:var(--color-sand-100)]">Your data</Link>
            <Link href="/account/notifications" className="rounded-lg px-3 py-2 hover:bg-[color:var(--color-sand-100)]">
              Notifications{unread > 0 && <span className="pill pill-bad ml-1">{unread}</span>}
            </Link>
            {isStaff(user.role) && <Link href="/admin" className="rounded-lg px-3 py-2 text-[color:var(--color-plum-600)] hover:bg-[color:var(--color-sand-100)]">Admin</Link>}
            <Link href="/checkout" className="btn btn-primary btn-sm ml-2">+ New invitation</Link>
            <form action={logoutAction}><button type="submit" className="rounded-lg px-3 py-2 text-[color:var(--color-ink-500)] hover:bg-[color:var(--color-sand-100)]">Sign out</button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-[color:var(--color-ink-500)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-sand-200)] pt-4">
          <span>Need a hand? {s['contact.hoursNote']}</span>
          <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} size="sm" />
        </div>
      </footer>
    </div>
  );
}
