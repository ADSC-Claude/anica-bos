import 'server-only';
import { cache } from 'react';
import { prisma } from './db';
import { DEFAULT_SETTINGS, type SettingKey, type Settings } from './settings-defaults';

export { DEFAULT_SETTINGS };
export type { SettingKey, Settings };

/** Loaded once per request. Falls back to defaults if the table is unreachable. */
export const getSettings = cache(async (): Promise<Settings> => {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  try {
    const rows = await prisma.setting.findMany();
    for (const row of rows) merged[row.key] = row.value;
  } catch (err) {
    console.error('[settings] falling back to defaults:', (err as Error).message);
  }
  return merged as Settings;
});

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const all = await getSettings();
  return all[key];
}

export async function setSetting(key: string, value: unknown, userId?: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as never, updatedBy: userId },
    create: { key, value: value as never, updatedBy: userId },
  });
}

export async function setSettings(entries: Record<string, unknown>, userId?: string) {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(key, value, userId);
  }
}
