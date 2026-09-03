import Link from 'next/link';
import { requireStaffSession } from '@/lib/guard';
import { ROLE_LABELS, visibleModules } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { unreadCount } from '@/lib/notifications';
import { logoutAction } from '@/app/login/actions';

export const metadata = { robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffSession();
  const [s, unread] = await Promise.all([getSettings(), unreadCount(user.id)]);
  const modules = visibleModules(user.role);
  return (
    <div className="min-h-dvh bg-[color:var(--color-sand-50)] lg:flex">
      <aside className="border-b border-[color:var(--color-sand-200)] bg-white lg:min-h-dvh lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="px-4 py-4">
          <Link href="/admin" className="display text-lg">{s['business.name']}</Link>
          <p className="text-xs text-[color:var(--color-ink-500)]">{user.name} · {ROLE_LABELS[user.role]}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
          {modules.map((m) => (
            <Link key={m.key} href={m.href} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[color:var(--color-sand-100)]">
              <span aria-hidden className="text-[color:var(--color-plum-500)]">{m.icon}</span>{m.label}
            </Link>
          ))}
          <Link href="/admin/notifications" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[color:var(--color-sand-100)]"><span aria-hidden className="text-[color:var(--color-plum-500)]">✉</span>Inbox{unread > 0 && <span className="pill pill-bad">{unread}</span>}</Link>
        </nav>
        <div className="hidden px-2 pb-4 lg:block">
          <Link href="/" className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">Public site</Link>
          <Link href="/admin/change-password" className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]">Change my password</Link>
          <form action={logoutAction}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[color:var(--color-sand-100)]" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
