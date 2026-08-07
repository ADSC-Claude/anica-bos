import Link from 'next/link';
import { requireSessionPage } from '@/lib/guard';
import { isFieldRole, ROLE_LABELS, visibleModules } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { logoutAction } from '@/app/login/actions';

export const metadata = { robots: { index: false } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionPage();
  const settings = await getSettings();
  const modules = visibleModules(user.role);

  // A cleaner gets a phone layout, not a shrunken owner dashboard: one column,
  // no sidebar, nothing to get lost in.
  if (isFieldRole(user.role)) {
    return (
      <div className="min-h-screen bg-[color:var(--color-sand-50)]">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--color-sand-200)] bg-white px-4 py-3">
          <div>
            <p className="text-sm font-bold">{user.name}</p>
            <p className="text-xs text-[color:var(--color-ink-500)]">{ROLE_LABELS[user.role]}</p>
          </div>
          <form action={logoutAction}>
            <button className="btn btn-secondary px-3 py-1.5 text-sm" type="submit">
              Sign out
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-sand-50)] lg:flex">
      <aside className="border-b border-[color:var(--color-sand-200)] bg-white lg:min-h-screen lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="px-4 py-4">
          <Link href="/portal" className="display text-lg font-bold">
            {settings['business.name']}
          </Link>
          <p className="text-xs text-[color:var(--color-ink-500)]">
            {user.name} · {ROLE_LABELS[user.role]}
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
          {modules.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[color:var(--color-sand-100)]"
            >
              <span aria-hidden className="text-[color:var(--color-clay-500)]">
                {m.icon}
              </span>
              {m.label}
            </Link>
          ))}
        </nav>

        <div className="hidden px-2 pb-4 lg:block">
          <Link
            href="/portal/change-password"
            className="block rounded-lg px-3 py-2 text-sm hover:bg-[color:var(--color-sand-100)]"
          >
            Change my password
          </Link>
          <form action={logoutAction}>
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[color:var(--color-sand-100)]"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
    </div>
  );
}
