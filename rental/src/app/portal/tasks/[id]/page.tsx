import { redirect, notFound } from 'next/navigation';
import { requirePage, assertProperty, HttpError } from '@/lib/guard';
import { can, isFieldRole } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { storeFile } from '@/lib/storage';
import { audit } from '@/lib/audit';
import {
  setChecklistItem,
  submitForInspection,
  outstandingItems,
  recordInspection,
  syncTask,
} from '@/lib/operations';
import { countdown, formatManila } from '@/lib/datetime';
import { BackLink, Card, Empty, Notice, PageHeader, Pill, PriorityPill } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * The cleaner's screen. Every tick is its own form posting to the server, so
 * progress is saved item by item — a dropped signal in a Bulacan stairwell
 * must not cost forty minutes of work.
 *
 * No client JavaScript: `capture="environment"` opens the phone camera
 * straight from a plain file input, and the whole thing works with JS off.
 */

async function loadTask(id: string, userId: string, role: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      property: true,
      assignee: { select: { id: true, name: true } },
      reservation: { select: { reference: true, guest: { select: { firstName: true } } } },
      cleaning: {
        include: {
          results: { include: { item: true }, orderBy: { item: { sortOrder: 'asc' } } },
          restocks: true,
        },
      },
      inspection: { include: { areas: true } },
      ticket: true,
    },
  });
  if (!task) return null;
  // The second gate: holding tasks.complete is not permission to complete
  // anyone's task.
  if (isFieldRole(role as never) && task.assigneeId !== userId) return null;
  return task;
}

async function tickItem(formData: FormData) {
  'use server';
  const user = await requirePage('tasks.complete');
  const taskId = String(formData.get('taskId'));
  const cleaningTaskId = String(formData.get('cleaningTaskId'));
  const itemId = String(formData.get('itemId'));
  const done = formData.get('done') === '1';

  const task = await loadTask(taskId, user.id, user.role);
  if (!task) notFound();
  await assertProperty(user, task.propertyId);

  let photoUrl: string | undefined;
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0) {
    const stored = await storeFile({
      file: photo,
      entityType: 'cleaning',
      entityId: cleaningTaskId,
      visibility: 'private',
    });
    photoUrl = stored.url;
    await prisma.attachment.create({
      data: {
        entityType: 'ChecklistResult',
        entityId: `${cleaningTaskId}:${itemId}`,
        url: stored.url,
        storagePath: stored.storagePath,
        kind: 'PHOTO',
        uploadedById: user.id,
      },
    });
  }

  try {
    await setChecklistItem({ cleaningTaskId, itemId, done, photoUrl });
  } catch (err) {
    if (err instanceof HttpError) {
      redirect(`/portal/tasks/${taskId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect(`/portal/tasks/${taskId}#item-${itemId}`);
}

async function finishCleaning(formData: FormData) {
  'use server';
  const user = await requirePage('tasks.complete');
  const taskId = String(formData.get('taskId'));
  const cleaningTaskId = String(formData.get('cleaningTaskId'));

  const task = await loadTask(taskId, user.id, user.role);
  if (!task) notFound();

  const restocks: { itemId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('restock:')) continue;
    const quantity = Number(value);
    if (quantity > 0) restocks.push({ itemId: key.slice('restock:'.length), quantity });
  }

  try {
    await submitForInspection({
      cleaningTaskId,
      restocks,
      notes: String(formData.get('notes') ?? ''),
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof HttpError) {
      redirect(`/portal/tasks/${taskId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await audit(user, {
    module: 'operations',
    action: 'cleaning_submitted',
    entityType: 'CleaningTask',
    entityId: cleaningTaskId,
    summary: `Turnover finished at ${task.property.name}, sent for inspection`,
    propertyId: task.propertyId,
  });

  redirect('/portal/tasks?ok=1');
}

async function submitInspection(formData: FormData) {
  'use server';
  const user = await requirePage('inspection.perform');
  const taskId = String(formData.get('taskId'));
  const inspectionId = String(formData.get('inspectionId'));

  const task = await loadTask(taskId, user.id, user.role);
  if (!task) notFound();

  const areas: { area: string; verdict: 'PASS' | 'NEEDS_ATTENTION' | 'FAIL'; note?: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('area:')) continue;
    const area = key.slice('area:'.length);
    areas.push({
      area,
      verdict: String(value) as 'PASS' | 'NEEDS_ATTENTION' | 'FAIL',
      note: String(formData.get(`note:${area}`) ?? ''),
    });
  }

  const result = await recordInspection({
    inspectionId,
    areas,
    notes: String(formData.get('notes') ?? ''),
    inspectorId: user.id,
  });

  await audit(user, {
    module: 'operations',
    action: 'inspection',
    entityType: 'Inspection',
    entityId: inspectionId,
    summary: `${task.property.name} inspection: ${result.status.toLowerCase().replace('_', ' ')}`,
    sensitive: result.status !== 'PASSED',
    propertyId: task.propertyId,
    after: { status: result.status, areas },
  });

  redirect('/portal/tasks?ok=1');
}

async function claimTask(formData: FormData) {
  'use server';
  const user = await requirePage('tasks.complete');
  const taskId = String(formData.get('taskId'));
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertProperty(user, task.propertyId);

  await prisma.$transaction(async (tx) => {
    await tx.cleaningTask.updateMany({ where: { taskId }, data: { assigneeId: user.id, status: 'ASSIGNED' } });
    await tx.inspection.updateMany({ where: { taskId }, data: { inspectorId: user.id } });
    await tx.maintenanceTicket.updateMany({ where: { taskId }, data: { assigneeId: user.id, status: 'ASSIGNED' } });
    await tx.task.update({ where: { id: taskId }, data: { assigneeId: user.id } });
    await syncTask(tx, taskId);
  });
  redirect(`/portal/tasks/${taskId}`);
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePage('tasks.view');
  const { id } = await params;
  const { error } = await searchParams;

  const task = await loadTask(id, user.id, user.role);
  if (!task) notFound();

  const field = isFieldRole(user.role);
  const inventory = task.cleaning
    ? await prisma.inventoryItem.findMany({
        where: { propertyId: task.propertyId, archived: false },
        orderBy: { name: 'asc' },
      })
    : [];

  const blockers = task.cleaning ? await outstandingItems(task.cleaning.id) : [];
  const mine = task.assigneeId === user.id;

  // Areas the inspector rules on: whatever the checklist covers, plus the
  // fixed ones that matter even when a template does not mention them.
  const areas = task.cleaning
    ? [...new Set(task.cleaning.results.map((r) => r.item.area))]
    : ['Bedrooms', 'Bathroom', 'Kitchen', 'Living area', 'Overall'];

  return (
    <>
      {!field && <BackLink href="/portal/tasks">All tasks</BackLink>}

      <PageHeader
        title={task.property.name}
        subtitle={
          task.cleaning
            ? `Out ${formatManila(task.cleaning.checkoutAt, { time: true })}${
                task.cleaning.nextCheckInAt
                  ? ` · next guest ${formatManila(task.cleaning.nextCheckInAt, { time: true })}`
                  : ''
              }`
            : task.title
        }
        actions={
          <span className="flex items-center gap-2">
            <PriorityPill priority={task.priority} />
            {task.dueAt && (
              <span
                className={`text-sm font-bold ${task.dueAt < new Date() ? 'text-[color:var(--bad)]' : ''}`}
              >
                {countdown(task.dueAt)}
              </span>
            )}
          </span>
        }
      />

      {error && <Notice kind="error">{error}</Notice>}

      {!mine && can(user.role, 'tasks.complete') && (
        <form action={claimTask} className="mb-4">
          <input type="hidden" name="taskId" value={task.id} />
          <button className="btn btn-secondary w-full" type="submit">
            {task.assignee ? `Take over from ${task.assignee.name}` : 'Assign this to me'}
          </button>
        </form>
      )}

      {/* --- cleaning checklist ------------------------------------------ */}
      {task.cleaning && task.cleaning.status !== 'COMPLETED' && (
        <>
          {task.cleaning.results.length === 0 ? (
            <Empty>No checklist template is set for this property. Add one in Settings → Checklists.</Empty>
          ) : (
            <form action={finishCleaning}>
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="cleaningTaskId" value={task.cleaning.id} />

              {areas.map((area) => {
                const items = task.cleaning!.results.filter((r) => r.item.area === area);
                const done = items.filter((r) => r.done).length;
                return (
                  <Card
                    key={area}
                    className="mb-3"
                    title={
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="uppercase tracking-wide">{area}</span>
                        <span className="text-xs font-normal text-[color:var(--color-ink-500)]">
                          {done}/{items.length}
                          {done === items.length && ' ✓'}
                        </span>
                      </span>
                    }
                  >
                    <ul className="divide-y divide-[color:var(--color-sand-200)]">
                      {items.map((r) => (
                        <li key={r.id} id={`item-${r.itemId}`} className="py-2">
                          <div className="flex items-start gap-3">
                            <span className={`mt-1 text-lg ${r.done ? 'text-[color:var(--ok)]' : 'text-[color:var(--color-sand-300)]'}`}>
                              {r.done ? '☑' : '☐'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${r.done ? 'line-through opacity-60' : 'font-medium'}`}>
                                {r.item.label}
                                {r.item.requiresPhoto && (
                                  <span className="ml-1" title="A photo is required">
                                    📷
                                  </span>
                                )}
                                {!r.item.mandatory && (
                                  <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">
                                    (optional)
                                  </span>
                                )}
                              </p>
                              {r.photoUrl && (
                                <p className="text-xs text-[color:var(--ok)]">Photo saved ✓</p>
                              )}
                              {r.item.requiresPhoto && !r.photoUrl && (
                                <p className="text-xs text-[color:var(--warn)]">Needs a photo</p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}

              {inventory.length > 0 && (
                <Card title="What did you put out?" className="mb-3">
                  <p className="mb-2 text-xs text-[color:var(--color-ink-500)]">
                    These come off the stock count.
                  </p>
                  <ul className="space-y-2">
                    {inventory.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm">
                          {item.name}
                          <span className="ml-1 text-xs text-[color:var(--color-ink-500)]">
                            ({item.stockQty} {item.unit} left)
                          </span>
                        </span>
                        <input
                          className="field w-20 text-center"
                          type="number"
                          min={0}
                          max={Math.max(0, item.stockQty)}
                          name={`restock:${item.id}`}
                          defaultValue={
                            task.cleaning!.restocks.find((x) => x.itemId === item.id)?.quantity ?? 0
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="Anything broken or missing?" className="mb-3">
                <textarea
                  className="field"
                  name="notes"
                  rows={3}
                  placeholder="Describe anything damaged, missing, or left behind. This is logged against the stay."
                  defaultValue={task.cleaning.notes}
                />
              </Card>

              <div className="sticky bottom-0 -mx-4 border-t border-[color:var(--color-sand-200)] bg-white p-4">
                <p className="mb-2 text-center text-sm">
                  {task.cleaning.results.filter((r) => r.done).length} of{' '}
                  {task.cleaning.results.length} done
                </p>
                <button
                  className="btn btn-primary w-full"
                  type="submit"
                  disabled={blockers.length > 0}
                  title={blockers.join('; ')}
                >
                  Send for inspection
                </button>
                {blockers.length > 0 && (
                  <p className="mt-2 text-center text-xs text-[color:var(--warn)]">
                    Still to do: {blockers.slice(0, 2).join('; ')}
                    {blockers.length > 2 ? ` and ${blockers.length - 2} more` : ''}
                  </p>
                )}
              </div>
            </form>
          )}

          {/* Ticking is its own form per item so each tap is saved on its own. */}
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold">Tick items</h2>
            {task.cleaning.results
              .filter((r) => !r.done)
              .map((r) => (
                <form
                  key={r.id}
                  action={tickItem}
                  encType="multipart/form-data"
                  className="card flex flex-wrap items-center gap-2 p-3"
                >
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="cleaningTaskId" value={task.cleaning!.id} />
                  <input type="hidden" name="itemId" value={r.itemId} />
                  <input type="hidden" name="done" value="1" />
                  <span className="min-w-0 flex-1 text-sm">
                    {r.item.area} — {r.item.label}
                  </span>
                  {r.item.requiresPhoto && (
                    <input
                      className="field w-auto text-xs"
                      type="file"
                      name="photo"
                      accept="image/*"
                      capture="environment"
                      required={!r.photoUrl}
                    />
                  )}
                  <button className="btn btn-secondary px-3 py-1 text-sm" type="submit">
                    Done
                  </button>
                </form>
              ))}
          </div>
        </>
      )}

      {/* --- inspection --------------------------------------------------- */}
      {task.inspection && task.inspection.status !== 'PASSED' && can(user.role, 'inspection.perform') && (
        <form action={submitInspection}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="inspectionId" value={task.inspection.id} />
          <Card title="Inspection" className="mb-3">
            <p className="mb-3 text-xs text-[color:var(--color-ink-500)]">
              The unit does not go back to READY until every area passes.
            </p>
            <ul className="space-y-3">
              {areas.map((area) => (
                <li key={area}>
                  <span className="label">{area}</span>
                  <div className="flex flex-wrap gap-3">
                    {(['PASS', 'NEEDS_ATTENTION', 'FAIL'] as const).map((v) => (
                      <label key={v} className="flex items-center gap-1 text-sm">
                        <input type="radio" name={`area:${area}`} value={v} defaultChecked={v === 'PASS'} />
                        {v === 'PASS' ? 'Pass' : v === 'NEEDS_ATTENTION' ? 'Needs attention' : 'Failed'}
                      </label>
                    ))}
                  </div>
                  <input className="field mt-1" name={`note:${area}`} placeholder="Note (optional)" />
                </li>
              ))}
            </ul>
            <textarea className="field mt-3" name="notes" rows={2} placeholder="Overall notes" />
            <button className="btn btn-primary mt-3 w-full" type="submit">
              Record inspection
            </button>
          </Card>
        </form>
      )}

      {/* --- maintenance -------------------------------------------------- */}
      {task.ticket && (
        <Card title={`Repair ${task.ticket.number}`}>
          <p className="text-sm">{task.ticket.description}</p>
          <p className="mt-2 text-xs text-[color:var(--color-ink-500)]">
            {task.ticket.category} · {task.ticket.status.toLowerCase().replace(/_/g, ' ')}
          </p>
        </Card>
      )}

      {task.cleaning?.status === 'COMPLETED' && (
        <Notice kind="ok">This turnover is finished and passed inspection.</Notice>
      )}

      {task.inspection?.status === 'PASSED' && (
        <Notice kind="ok">Inspection passed — the unit is back to READY.</Notice>
      )}

      {!field && (
        <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
          {task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'} ·{' '}
          <Pill tone="muted">{task.status.toLowerCase().replace('_', ' ')}</Pill>
        </p>
      )}
    </>
  );
}
