import Link from 'next/link';

/**
 * One place with two tabs. The pages are drawn in the studio and the details
 * — the name, the occasions, the packages, the opening, the words — are on
 * the form. Before this they were two pages that linked to each other, and
 * the preview beside the form was the only place the invitation could be
 * seen while the studio's canvas stayed blank; the strip says they are one
 * thing, the way the customer's tabs do.
 */
export function TemplateTabs({ id, active }: { id: string | null; active: 'pages' | 'details' }) {
  // A design not yet created has no studio to open; the tab is there so
  // the strip reads the same before and after, and says when it opens.
  const tabs = [
    { key: 'pages', label: 'Pages — the studio', href: id ? `/admin/templates/${id}/design` : null, soon: 'opens once the template is created' },
    { key: 'details', label: 'Details', href: id ? `/admin/templates/${id}` : null, soon: null },
  ] as const;
  const on = 'border-[color:var(--color-plum-600)] font-semibold text-[color:var(--color-plum-600)]';
  const offLink = 'border-transparent text-[color:var(--color-ink-700)] hover:border-[color:var(--color-sand-300)] hover:text-[color:var(--color-ink-900)]';
  const offSoon = 'border-transparent text-[color:var(--color-ink-500)]';
  return (
    <nav aria-label="This design" className="mb-4 border-b border-[color:var(--color-sand-200)]">
      <ul className="flex flex-wrap gap-1 text-sm">
        {tabs.map((t) => {
          const current = t.key === active;
          const cls = `-mb-px block border-b-2 px-3 py-2.5 ${current ? on : t.href ? offLink : offSoon}`;
          return (
            <li key={t.key}>
              {t.href ? (
                <Link href={t.href} aria-current={current ? 'page' : undefined} className={cls}>{t.label}</Link>
              ) : (
                <span aria-current={current ? 'page' : undefined} aria-disabled={current ? undefined : true} className={cls}>
                  {t.label}
                  {!current && t.soon && <span className="ml-1 font-normal">· {t.soon}</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
