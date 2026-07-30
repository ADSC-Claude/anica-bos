import 'server-only';
import { cache } from 'react';
import { prisma } from './db';
import { DEFAULT_SETTINGS, type SettingKey, type Settings } from './settings-defaults';

/**
 * Everything configurable lives here with a sane default, so a fresh install
 * works before the Owner has touched Settings. Values are stored in the
 * `Setting` table as JSON; `branchId: null` means business-wide.
 */
export { DEFAULT_SETTINGS };
export type { SettingKey, Settings };


/**
 * Loaded once per request. Branch-scoped rows override business-wide rows.
 */
export const getSettings = cache(async (branchId?: string | null): Promise<Settings> => {
  const rows = await prisma.setting.findMany({
    where: { OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
    orderBy: { branchId: 'asc' }, // nulls first in Postgres asc → branch overrides win
  });
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.branchId === null) merged[row.key] = row.value;
  }
  for (const row of rows) {
    if (row.branchId !== null) merged[row.key] = row.value;
  }
  return merged as Settings;
});

export async function getSetting<K extends SettingKey>(
  key: K,
  branchId?: string | null,
): Promise<Settings[K]> {
  const all = await getSettings(branchId);
  return all[key];
}

export async function setSetting(
  key: string,
  value: unknown,
  opts: { branchId?: string | null; userId?: string } = {},
) {
  const branchId = opts.branchId ?? null;
  // Prisma cannot express a NULL member of a compound unique in `upsert`,
  // so the null-branch (business-wide) case is handled explicitly.
  const existing = await prisma.setting.findFirst({ where: { key, branchId } });
  if (existing) {
    await prisma.setting.update({
      where: { id: existing.id },
      data: { value: value as never, updatedBy: opts.userId },
    });
  } else {
    await prisma.setting.create({
      data: { key, value: value as never, branchId, updatedBy: opts.userId },
    });
  }
}

export async function setSettings(
  entries: Record<string, unknown>,
  opts: { branchId?: string | null; userId?: string } = {},
) {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(key, value, opts);
  }
}

/** Convenience: the branch a user operates in, falling back to the default. */
export const getBranch = cache(async (branchId?: string | null) => {
  if (branchId) {
    const b = await prisma.branch.findUnique({ where: { id: branchId } });
    if (b) return b;
  }
  return prisma.branch.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
});

export const listBranches = cache(async () =>
  prisma.branch.findMany({ where: { active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
);
