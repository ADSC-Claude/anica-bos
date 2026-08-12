import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePage, assertProperty, HttpError } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { formatPeso, toCents } from '@/lib/money';
import { formatManila, formatStayDate } from '@/lib/datetime';
import { blockDatesFor, completeTicket, releaseTicketBlock, updateTicket } from '@/lib/maintenance';
import {
  BackLink,
  Card,
  Empty,
  Field,
  Notice,
  PageHeader,
  Pill,
  PriorityPill,
  TextArea,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  REPORTED: 'warn',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING_PARTS: 'warn',
  COMPLETED: 'ok',
  CANCELLED: 'muted',
} as const;

function back(id: string, message: string, kind: 'ok' | 'error' = 'ok'): never {
  redirect(`/portal/maintenance/${id}?${kind}=${encodeURIComponent(message)}`);
}

async function guardTicket(id: string, permission: Parameters<typeof requirePage>[0]) {
  const user = await requirePage(permission);
  const ticket = await prisma.maintenanceTicket.findUnique({
    where: { id },
    select: { propertyId: true },
  });
  if (!ticket) notFound();
  await assertProperty(user, ticket.propertyId);
  return user;
}

async function updateAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardTicket(id, 'maintenance.edit');
  await updateTicket({
    ticketId: id,
    status: String(formData.get('status')) as never,
    priority: String(formData.get('priority')) as never,
    assigneeId: String(formData.get('assigneeId') || '') || null,
    vendorId: String(formData.get('vendorId') || '') || null,
    notes: String(formData.get('notes') ?? ''),
    user,
  });
  back(id, 'Ticket updated.');
}

async function completeAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardTicket(id, 'maintenance.cost');
  try {
    const { expenseId } = await completeTicket({
      ticketId: id,
      costCents: toCents(String(formData.get('cost') || '0')),
      notes: String(formData.get('notes') ?? ''),
      user,
    });
    back(
      id,
      expenseId
        ? 'Completed. The cost is now an expense against this property — nothing to re-enter.'
        : 'Completed.',
    );
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
}

async function blockAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const user = await guardTicket(id, 'maintenance.edit');
  try {
    await blockDatesFor(id, String(formData.get('until')), user);
    back(id, 'Those dates are off sale.');
  } catch (err) {
    if (err instanceof HttpError) back(id, err.message, 'error');
    throw err;
  }
}

async function unblockAction(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  await guardTicket(id, 'maintenance.edit');
  await releaseTicketBlock(id);
  back(id, 'Dates back on sale.');
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePage('maintenance.view');

  const ticket = await prisma.maintenanceTicket.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true } },
      assignee: { select: { name: true } },
      vendor: { select: { name: true } },
      reportedBy: { select: { name: true } },
      block: true,
      expenses: { include: { category: { select: { name: true } } } },
      task: { select: { id: true } },
    },
  });
  if (!ticket) notFound();
  await assertProperty(user, ticket.propertyId);

  const mayEdit = can(user.role, 'maintenance.edit');
  const mayCost = can(user.role, 'maintenance.cost');
  const done = ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED';

  const staff = mayEdit
    ? await prisma.user.findMany({
        where: { active: true, role: { in: ['MAINTENANCE', 'MANAGER'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const vendors = mayEdit
    ? await prisma.vendor.findMany({
        where: { active: true, kind: { in: ['MAINTENANCE', 'OTHER'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <>
      <BackLink href="/portal/maintenance">All tickets</BackLink>
      <PageHeader
        title={`${ticket.category} — ${ticket.property.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{ticket.number}</span>
            <Pill tone={STATUS_TONE[ticket.status]}>
              {ticket.status.toLowerCase().replace('_', ' ')}
            </Pill>
            <PriorityPill priority={ticket.priority} />
            {ticket.blockId && <Pill tone="bad">dates blocked</Pill>}
          </span>
        }
        actions={
          <Link className="btn btn-secondary" href={`/portal/tasks/${ticket.taskId}`}>
            Open on the board
          </Link>
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="The fault">
            <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[color:var(--color-ink-500)]">
              <div>
                <dt>Reported</dt>
                <dd>
                  {formatManila(ticket.reportedAt, { time: true })}
                  {ticket.reportedBy ? ` by ${ticket.reportedBy.name}` : ''}
                </dd>
              </div>
              {ticket.startedAt && (
                <div>
                  <dt>Started</dt>
                  <dd>{formatManila(ticket.startedAt, { time: true })}</dd>
                </div>
              )}
              {ticket.completedAt && (
                <div>
                  <dt>Completed</dt>
                  <dd>{formatManila(ticket.completedAt, { time: true })}</dd>
                </div>
              )}
            </dl>
            {ticket.notes && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[color:var(--color-sand-100)] p-3 text-sm">
                {ticket.notes}
              </p>
            )}
          </Card>

          {mayEdit && !done && (
            <Card title="Progress">
              <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={ticket.id} />
                <label className="block">
                  <span className="label">Status</span>
                  <select className="field" name="status" defaultValue={ticket.status}>
                    <option value="REPORTED">Reported</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="WAITING_PARTS">Waiting on parts</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Priority</span>
                  <select className="field" name="priority" defaultValue={ticket.priority}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Assigned to</span>
                  <select className="field" name="assigneeId" defaultValue={ticket.assigneeId ?? ''}>
                    <option value="">Nobody</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Vendor</span>
                  <select className="field" name="vendorId" defaultValue={ticket.vendorId ?? ''}>
                    <option value="">None</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <TextArea label="Working notes" name="notes" defaultValue={ticket.notes} rows={3} />
                </div>
                <div className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    Save
                  </button>
                </div>
              </form>
            </Card>
          )}

          {mayCost && !done && (
            <Card title="Complete and book the cost">
              <form action={completeAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={ticket.id} />
                <Field
                  label="Cost"
                  name="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  hint="Written straight to expenses under Maintenance, against this property."
                />
                <div className="sm:col-span-2">
                  <TextArea label="What was done" name="notes" defaultValue={ticket.notes} rows={2} />
                </div>
                <div className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    Mark complete
                  </button>
                  {ticket.blockId && (
                    <span className="ml-3 text-xs text-[color:var(--color-ink-500)]">
                      Completing also puts the blocked dates back on sale.
                    </span>
                  )}
                </div>
              </form>
            </Card>
          )}

          {ticket.expenses.length > 0 && (
            <Card title="Booked to expenses">
              <ul className="space-y-1 text-sm">
                {ticket.expenses.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>
                      {formatStayDate(e.date)} · {e.category.name}
                    </span>
                    <span className="tabular-nums">{formatPeso(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Dates">
            {ticket.block ? (
              <div className="space-y-3 text-sm">
                <p>
                  Off sale {formatStayDate(ticket.block.startDate)} →{' '}
                  {formatStayDate(ticket.block.endDate)}.
                </p>
                {mayEdit && (
                  <form action={unblockAction}>
                    <input type="hidden" name="id" value={ticket.id} />
                    <button className="btn btn-secondary" type="submit">
                      Put back on sale
                    </button>
                  </form>
                )}
              </div>
            ) : mayEdit && !done ? (
              <form action={blockAction} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={ticket.id} />
                <p className="text-[color:var(--color-ink-500)]">
                  A block goes through the same constraint as a booking. If a guest already holds
                  any of those nights it is refused outright rather than evicting them.
                </p>
                <label className="block">
                  <span className="label">Off sale until</span>
                  <input className="field" name="until" type="date" required />
                </label>
                <button className="btn btn-secondary" type="submit">
                  Take dates off sale
                </button>
              </form>
            ) : (
              <Empty>No dates blocked.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
