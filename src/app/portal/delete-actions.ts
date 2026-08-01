'use server';

import { revalidatePath } from 'next/cache';
import { requirePage } from '@/lib/guard';
import { audit } from '@/lib/audit';
import { DELETABLE, checkDeletable, type DeletableKind } from '@/lib/deletable';

export type DeleteState = { error?: string; ok?: string };

/**
 * One action for every deletable record, because the rule about what may be
 * deleted belongs in one readable place rather than repeated across five
 * modules — see src/lib/deletable.ts.
 *
 * Financial records are absent by construction: there is no entry for sales,
 * receipts, journals or payslips, so no button can be wired to delete one.
 */
export async function deleteRecordAction(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const kind = String(formData.get('kind') ?? '') as DeletableKind;
  const id = String(formData.get('id') ?? '');
  const mode = String(formData.get('mode') ?? 'delete'); // 'delete' | 'deactivate'

  const entity = DELETABLE[kind];
  if (!entity || !id) return { error: 'Nothing selected.' };

  const user = await requirePage(entity.permission);

  const check = await checkDeletable(kind, id);
  if (!check) return { error: `That ${entity.noun} no longer exists.` };

  // Refusals about the actor rather than the record — deleting the account you
  // are holding, or the last Owner. Checked before the mode branch because
  // hiding those is exactly as bad as deleting them.
  const guard = 'guard' in entity ? entity.guard : undefined;
  if (guard) {
    const refusal = await guard(id, user.id);
    if (refusal) return { error: refusal };
  }

  if (mode === 'deactivate') {
    const deactivate = 'deactivate' in entity ? entity.deactivate : undefined;
    if (!deactivate) return { error: `A ${entity.noun} cannot be hidden — it can only be deleted.` };
    await deactivate.run(id);
    await audit(user, {
      module: entity.module,
      action: `deactivate_${kind}`,
      entityType: kind,
      entityId: id,
      summary: `Deactivated ${entity.noun} "${check.name}"`,
      sensitive: false,
    });
    revalidateFor(kind);
    return { ok: `"${check.name}" is no longer active. Its history is intact.` };
  }

  if (!check.deletable) {
    // Say what is in the way rather than surfacing a foreign-key error.
    const because = check.blockedBy.join(', ');
    return {
      error: `"${check.name}" cannot be deleted — it is used by ${because}.${
        check.deactivate ? ` ${check.deactivate}` : ''
      }`,
    };
  }

  if ('cascade' in entity && entity.cascade) await entity.cascade(id);
  await entity.remove(id);

  // Deletions are irreversible, so the audit entry is the only remaining
  // record that this existed at all.
  await audit(user, {
    module: entity.module,
    action: `delete_${kind}`,
    entityType: kind,
    entityId: id,
    summary: `Deleted ${entity.noun} "${check.name}"`,
    sensitive: true,
  });

  revalidateFor(kind);
  return { ok: `"${check.name}" deleted.` };
}

function revalidateFor(kind: DeletableKind) {
  const paths: Record<DeletableKind, string[]> = {
    service: ['/portal/settings/services', '/'],
    resource: ['/portal/settings/resources'],
    serviceCategory: ['/portal/settings/services', '/'],
    client: ['/portal/clients'],
    employee: ['/portal/employees'],
    item: ['/portal/inventory'],
    user: ['/portal/settings/users'],
  };
  for (const p of paths[kind]) revalidatePath(p);
}
