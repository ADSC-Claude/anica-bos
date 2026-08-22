import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage, assertProperty, visibleProperties } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatManila } from '@/lib/datetime';
import { deadlineLabel, syncTask } from '@/lib/operations';
import { audit } from '@/lib/audit';
import { Card, Empty, PageHeader, Pill, PriorityPill, ReadyPill, Notice } from '@/components/ui';

export const metadata = { title: 'Turnovers' };
export const dynamic = 'force-dynamic';

const CLEANING_TONE = {
  PENDING: 'warn',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  INSPECTION: 'info',
  COMPLETED: 'ok',
  CANCELLED: 'muted',
} as const;

function back(message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/cleaning?${kind}=${encodeURIComponent(message)}`);
}

async function assignAction(formData: FormData) {
  'use server';
  const cleaningId = String(formData.get('cleaningId'));
  const assigneeId = String(formData.get('assigneeId') ?? '');
  const user = await requirePage('cleaning.manage');

  const cleaning = await prisma.cleaningTask.findUnique({
    where: { id: cleaningId },
    select: { propertyId: true, taskId: true, status: true },
  });
  if (!cleaning) back('That turnover no longer exists.', 'error');
  await assertProperty(user, cleaning.propertyId);

  await prisma.$transaction(async (tx) => {
    await tx.cleaningTask.update({
      where: { id: cleaningId },
      data: {
        assigneeId: assigneeId || null,
        // Assigning is what moves PENDING on; a clean already under way keeps
        // its status so reassignment does not rewind someone's progress.
        status: cleaning.status === 'PENDING' && assigneeId ? 'ASSIGNED' : cleaning.status,
      },
    });
    await tx.task.update({ where: { id: cleaning.taskId }, data: { assigneeId: assigneeId || null } });
    await syncTask(tx, cleaning.taskId);
  });

  await audit(user, {
    module: 'cleaning',
    action: 'assign',
    entityType: 'CleaningTask',
    entityId: cleaningId,
    summary: assigneeId ? 'Turnover assigned' : 'Turnover unassigned',
    after: { assigneeId: assigneeId || null },
  });
  back(assigneeId ? 'Assigned. It is on their phone now.' : 'Unassigned.');
}

export default async function CleaningPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string }>;
}) {
  const user = await requirePage('cleaning.view');
  const sp = await searchParams;
  const mayManage = can(user.role, 'cleaning.manage');
  const propertyIds = await visibleProperties(user);
  const now = new Date();

  const open = await prisma.cleaningTask.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      status: sp.status
        ? (sp.status as never)
        : { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION'] },
    },
    include: {
      property: { select: { name: true } },
      assignee: { select: { name: true } },
      task: { select: { id: true, priority: true, status: true } },
      reservation: { select: { reference: true } },
      inspection: { select: { id: true, status: true, taskId: true } },
      _count: { select: { results: true } },
    },
    orderBy: [{ nextCheckInAt: { sort: 'asc', nulls: 'last' } }, { checkoutAt: 'asc' }],
    take: 100,
  });

  const properties = await prisma.property.findMany({
    where: propertyIds ? { id: { in: propertyIds } } : {},
    select: { id: true, name: true, readyState: true },
    orderBy: { sortOrder: 'asc' },
  });

  const cleaners = mayManage
    ? await prisma.user.findMany({
        where: { active: true, role: { in: ['CLEANER', 'MANAGER'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  const overdue = open.filter((c) => c.nextCheckInAt && c.nextCheckInAt < now);

  return (
    <>
      <PageHeader
        title="Turnovers"
        subtitle="Checkout opens a clean; the inspection closes it. A unit is not ready until both are done."
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <Card title="Where each unit stands" className="mb-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-[color:var(--color-sand-200)] px-3 py-2 text-sm"
            >
              <span className="font-medium">{p.name}</span>
              <ReadyPill state={p.readyState} />
            </div>
          ))}
        </div>
      </Card>

      {overdue.length > 0 && (
        <Notice kind="error">
          {overdue.length} turnover{overdue.length === 1 ? ' is' : 's are'} past the next arrival:{' '}
          {overdue.map((c) => c.property.name).join(', ')}.
        </Notice>
      )}

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select className="field w-auto" name="status" defaultValue={sp.status ?? ''}>
          <option value="">Open turnovers</option>
          <option value="PENDING">Pending</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="INSPECTION">Awaiting inspection</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
      </form>

      {open.length === 0 ? (
        <Empty>Nothing outstanding. Every unit is clean and inspected.</Empty>
      ) : (
        <div className="space-y-3">
          {open.map((c) => {
            const late = c.nextCheckInAt && c.nextCheckInAt < now;
            return (
              <Card key={c.id} className={late ? 'border-[color:var(--bad)]' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/portal/tasks/${c.taskId}`} className="font-semibold hover:underline">
                        {c.property.name}
                      </Link>
                      <Pill tone={CLEANING_TONE[c.status]}>
                        {c.status.toLowerCase().replace('_', ' ')}
                      </Pill>
                      <PriorityPill priority={c.task.priority} />
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">
                      Vacated {formatManila(c.checkoutAt, { time: true })}
                      {c.reservation ? ` after ${c.reservation.reference}` : ''} ·{' '}
                      {c.nextCheckInAt ? (
                        <span className={late ? 'font-semibold text-[color:var(--bad)]' : ''}>
                          next arrival {deadlineLabel(c.nextCheckInAt, now)} (
                          {formatManila(c.nextCheckInAt, { time: true })})
                        </span>
                      ) : (
                        'no arrival booked yet'
                      )}
                    </p>
                    {c.inspection && (
                      <p className="mt-1 text-xs">
                        Inspection:{' '}
                        <Link className="underline" href={`/portal/tasks/${c.inspection.taskId}`}>
                          {c.inspection.status.toLowerCase().replace('_', ' ')}
                        </Link>
                      </p>
                    )}
                  </div>

                  <div className="text-right text-sm">
                    {mayManage ? (
                      <form action={assignAction} className="flex items-center gap-2">
                        <input type="hidden" name="cleaningId" value={c.id} />
                        <select
                          className="field w-auto py-1 text-sm"
                          name="assigneeId"
                          defaultValue={c.assigneeId ?? ''}
                        >
                          <option value="">Unassigned</option>
                          {cleaners.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-secondary px-3 py-1 text-sm" type="submit">
                          Assign
                        </button>
                      </form>
                    ) : (
                      <span className="text-[color:var(--color-ink-500)]">
                        {c.assignee?.name ?? 'Unassigned'}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
