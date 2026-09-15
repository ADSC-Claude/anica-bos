import Link from 'next/link';

/**
 * One place with two tabs. The pages are drawn in the studio and the details
 * — the name, the occasions, the packages, the opening, the words — are on
 * the form. Before this they were two pages that linked to each other, and
 * the preview beside the form was the only place the invitation could be
 * seen while the studio's canvas stayed blank; the strip says they are one
 * thing, the way the customer's tabs do.
 */
export function TemplateTabs({ id, active }: { id: string; active: 'pages' | 'details' }) {
  const tabs = [
    { key: 'pages', label: 'Pages — the studio', href: `/admin/templates/${id}/design` },
    { key: 'details', label: 'Details', href: `/admin/templates/${id}` },
  ] as const;
  return (
    <nav aria-label="This design" className="mb-4 border-b border-[color:var(--color-sand-200)]">
      <ul className="flex gap-1 text-sm">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`-mb-px block border-b-2 px-3 py-2.5 ${on ? 'border-[color:var(--color-plum-600)] font-semibold text-[color:var(--color-plum-600)]' : 'border-transparent text-[color:var(--color-ink-700)] hover:border-[color:var(--color-sand-300)] hover:text-[color:var(--color-ink-900)]'}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
