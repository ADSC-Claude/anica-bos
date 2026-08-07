import 'server-only';
import { prisma } from './db';
import { SETTINGS_DEFAULTS, type SettingKey, type SettingsShape } from './settings-defaults';

/**
 * Stored values layered over the defaults, so a key added in code works before
 * anyone opens the Settings screen and a key deleted from the database falls
 * back rather than becoming undefined halfway down a page render.
 */
export async function getSettings(): Promise<SettingsShape> {
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTINGS_DEFAULTS } as SettingsShape;
  for (const key of Object.keys(out) as SettingKey[]) {
    if (key in stored && stored[key] !== null && stored[key] !== undefined) {
      (out as Record<string, unknown>)[key] = stored[key];
    }
  }
  return out;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsShape[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row || row.value === null) return SETTINGS_DEFAULTS[key];
  return row.value as SettingsShape[K];
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsShape[K]) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}

export async function setSettings(values: Partial<SettingsShape>) {
  for (const [key, value] of Object.entries(values)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }
}

/**
 * Coerces a form field to the type the default declares. A settings form posts
 * strings; a percent that arrives as "30" and gets stored as a string is the
 * kind of bug that only shows up in arithmetic three screens away.
 */
export function coerceSetting(key: SettingKey, raw: string): unknown {
  const current = SETTINGS_DEFAULTS[key] as unknown;
  if (typeof current === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : current;
  }
  if (typeof current === 'boolean') return raw === 'on' || raw === 'true' || raw === '1';
  if (Array.isArray(current)) {
    return raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return raw;
}
