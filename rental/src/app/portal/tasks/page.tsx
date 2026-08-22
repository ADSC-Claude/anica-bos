import Link from 'next/link';
import { requirePage, visibleProperties, scopeToAssignee } from '@/lib/guard';
import { isFieldRole } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { countdown, formatManila, manilaDateKey, toStayDate } from '@/lib/datetime';
import { PageHeader, Card, Empty, PriorityPill, Pill } from '@/components/ui';

export const metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  CLEANING: 'Turnover',
  INSPECTION: 'Inspection',
  MAINTENANCE: 'Repair',
  RESTOCK: 'Restock',
  ARRIVAL_PREP: 'Arrival prep',
  FOLLOW_UP: 'Follow up',
  MANUAL: 'Task',
};

/**
 * The staff home screen, and the one screen that decides whether this system
 * gets used or abandoned.
 *
 * For a field role it renders as a single column of large cards sorted by
 * deadline pressure — one thumb, no sidebar, no menu, and nothing on screen
 * they are not allowed to act on.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; assignee?: string; show?: string }>;
}) {
  const user = await requirePage('tasks.view');
  const params = await searchParams;
  const field = isFieldRole(user.role);
  const propertyIds = await visibleProperties(user);

  const showDone = params.show === 'done';

  const where = scopeToAssignee(user, {
    ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
    ...(params.property ? { propertyId: params.property } : {}),
    ...(params.assignee ? { assigneeId: params.assignee } : {}),
    status: showDone ? { in: ['DONE', 'CANCELLED'] } : { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
  });

  const tasks = await prisma.task.findMany({
    where,
    include: {
      property: { select: { id: true, name: true, city: true, addressLine: true } },
      assignee: { select: { name: true } },
      cleaning: { select: { id: true, status: true, checkoutAt: true, nextCheckInAt: true } },
      inspection: { select: { id: true, status: true } },
      ticket: { select: { id: true, number: true, status: true } },
      reservation: { select: { reference: true, guest: { select: { firstName: true } } } },
    },
    orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    take: 100,
  });

  // Priority is stored URGENT..LOW but enum order is LOW..URGENT, so sort by
  // the meaning rather than by the letters.
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  tasks.sort(
    (a, b) =>
      rank[a.priority] - rank[b.priority] ||
      (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
  );

  const doneToday = field
    ? await prisma.task.count({
        where: {
          assigneeId: user.id,
          status: 'DONE',
          completedAt: { gte: toStayDate(manilaDateKey()) },
        },
      })
    : 0;

  const properties = field
    ? []
    : await prisma.property.findMany({
        where: propertyIds ? { id: { in: propertyIds } } : {},
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      });

  const staff = field
    ? []
    : await prisma.user.findMany({
        where: { active: true, role: { in: ['CLEANER', 'INSPECTOR', 'MAINTENANCE', 'MANAGER'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });

  return (
    <>
      <PageHeader
        title={field ? 'Today' : 'Task board'}
        subtitle={
          field
            ? `${tasks.length} to do${doneToday ? ` · ${doneToday} done today` : ''}`
            : `${tasks.length} open`
        }
        actions={
          !field && (
            <form className="flex flex-wrap gap-2" method="get">
              <select className="field w-auto" name="property" defaultValue={params.property ?? ''}>
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="field w-auto" name="assignee" defaultValue={params.assignee ?? ''}>
                <option value="">Anyone</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="field w-auto" name="show" defaultValue={params.show ?? 'open'}>
                <option value="open">Open</option>
                <option value="done">Finished</option>
              </select>
              <button className="btn btn-secondary" type="submit">
                Filter
              </button>
            </form>
          )
        }
      />

      {tasks.length === 0 ? (
        <Empty>{field ? 'Nothing assigned to you right now.' : 'Nothing open. Everything is done.'}</Empty>
      ) : (
        <ul className={field ? 'space-y-3' : 'space-y-2'}>
          {tasks.map((t) => {
            const urgent = t.priority === 'URGENT';
            return (
              <li key={t.id}>
                <Link
                  href={`/portal/tasks/${t.id}`}
                  className={`block rounded-xl border bg-white p-4 hover:border-[color:var(--color-clay-500)] ${
                    urgent
                      ? 'border-2 border-[color:var(--bad)]'
                      : 'border-[color:var(--color-sand-200)]'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">
                      {KIND_LABEL[t.kind] ?? t.kind}
                    </span>
                    <span className="flex items-center gap-2">
                      <PriorityPill priority={t.priority} />
                      {t.dueAt && (
                        <span
                          className={`text-xs font-bold ${
                            t.dueAt < new Date() ? 'text-[color:var(--bad)]' : ''
                          }`}
                        >
                          {countdown(t.dueAt)}
                        </span>
                      )}
                    </span>
                  </div>

                  <p className={`font-semibold ${field ? 'text-lg' : ''}`}>{t.property.name}</p>
                  <p className="text-sm text-[color:var(--color-ink-500)]">
                    {t.cleaning
                      ? `Out ${formatManila(t.cleaning.checkoutAt, { time: true })}${
                          t.cleaning.nextCheckInAt
                            ? ` · next guest ${formatManila(t.cleaning.nextCheckInAt, { time: true })}`
                            : ' · nobody arriving after'
                        }`
                      : t.title}
                  </p>
                  {field && t.property.addressLine && (
                    <p className="text-xs text-[color:var(--color-ink-500)]">
                      {t.property.addressLine}, {t.property.city}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {t.status === 'IN_PROGRESS' && <Pill tone="warn">In progress</Pill>}
                    {t.status === 'BLOCKED' && <Pill tone="bad">Needs attention</Pill>}
                    {!field && t.assignee && <Pill tone="muted">{t.assignee.name}</Pill>}
                    {!field && !t.assignee && <Pill tone="warn">Unassigned</Pill>}
                    {!field && t.reservation && <Pill tone="info">{t.reservation.reference}</Pill>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {field && (
        <p className="mt-6 text-center text-xs text-[color:var(--color-ink-500)]">
          Only your own work is shown here.
        </p>
      )}
    </>
  );
}
