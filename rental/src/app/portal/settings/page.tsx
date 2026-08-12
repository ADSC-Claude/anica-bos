import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { getSettings, coerceSetting, setSettings } from '@/lib/settings';
import {
  SETTINGS_GROUPS,
  SETTING_LABELS,
  SETTINGS_DEFAULTS,
  type SettingKey,
} from '@/lib/settings-defaults';
import { audit, diff } from '@/lib/audit';
import { Card, Notice, PageHeader } from '@/components/ui';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Everything a person can change without a deploy. Grouped by what it governs,
 * with the current value in the field rather than a placeholder — a settings
 * screen that shows you blanks is one you cannot check at a glance.
 */

async function saveAction(formData: FormData) {
  'use server';
  const user = await requirePage('settings.edit');
  const groupTitle = String(formData.get('group') ?? '');
  const group = SETTINGS_GROUPS.find((g) => g.title === groupTitle);
  if (!group) redirect('/portal/settings?error=' + encodeURIComponent('Unknown settings group.'));

  const before = await getSettings();
  const values: Record<string, unknown> = {};
  for (const key of group.keys) {
    const raw = formData.get(key);
    // An unchecked checkbox posts nothing at all, which is the value `false`
    // and not "leave it alone" — hence the explicit boolean branch.
    if (typeof SETTINGS_DEFAULTS[key] === 'boolean') {
      values[key] = raw === 'on';
    } else if (raw !== null) {
      values[key] = coerceSetting(key, String(raw));
    }
  }

  await setSettings(values as never);

  const changes = diff(
    Object.fromEntries(group.keys.map((k) => [k, before[k]])),
    values as Record<string, unknown>,
  );
  await audit(user, {
    module: 'settings',
    action: 'update',
    entityType: 'Setting',
    entityId: group.title,
    summary: `${group.title} updated`,
    before: changes.before,
    after: changes.after,
  });

  redirect(`/portal/settings?ok=${encodeURIComponent(`${group.title} saved.`)}`);
}

function fieldFor(key: SettingKey, value: unknown) {
  const label = SETTING_LABELS[key] ?? key;
  const fallback = SETTINGS_DEFAULTS[key] as unknown;

  if (typeof fallback === 'boolean') {
    return (
      <label key={key} className="flex items-center gap-2 py-1 text-sm sm:col-span-2">
        <input type="checkbox" name={key} defaultChecked={Boolean(value)} />
        <span>{label}</span>
      </label>
    );
  }

  if (Array.isArray(fallback)) {
    return (
      <label key={key} className="block sm:col-span-2">
        <span className="label">{label}</span>
        <input className="field" name={key} defaultValue={(value as number[]).join(', ')} />
        <span className="mt-1 block text-xs text-[color:var(--color-ink-500)]">
          Comma-separated numbers.
        </span>
      </label>
    );
  }

  if (typeof fallback === 'number') {
    return (
      <label key={key} className="block">
        <span className="label">{label}</span>
        <input className="field" name={key} type="number" defaultValue={Number(value)} />
      </label>
    );
  }

  const long = String(value).length > 90;
  return (
    <label key={key} className={long ? 'block sm:col-span-2' : 'block'}>
      <span className="label">{label}</span>
      {long ? (
        <textarea className="field" name={key} rows={3} defaultValue={String(value)} />
      ) : (
        <input className="field" name={key} defaultValue={String(value)} />
      )}
    </label>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await requirePage('settings.view');
  const sp = await searchParams;
  const settings = await getSettings();
  const mayEdit = can(user.role, 'settings.edit');

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Change these and the site, the emails and the alarms change with them — no deploy."
        actions={
          <>
            <Link className="btn btn-secondary" href="/portal/settings/templates">
              Message templates
            </Link>
            {can(user.role, 'users.manage') && (
              <Link className="btn btn-secondary" href="/portal/settings/users">
                People
              </Link>
            )}
          </>
        }
      />

      {sp.ok && <Notice kind="ok">{sp.ok}</Notice>}
      {sp.error && <Notice kind="error">{sp.error}</Notice>}

      <div className="space-y-4">
        {SETTINGS_GROUPS.map((group) => (
          <Card key={group.title} title={group.title}>
            <p className="mb-3 text-sm text-[color:var(--color-ink-500)]">{group.description}</p>
            <form action={saveAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="group" value={group.title} />
              {group.keys.map((key) => fieldFor(key, settings[key]))}
              {mayEdit && (
                <div className="sm:col-span-2">
                  <button className="btn btn-primary" type="submit">
                    Save {group.title.toLowerCase()}
                  </button>
                </div>
              )}
            </form>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs text-[color:var(--color-ink-500)]">
        Money is stored in centavos throughout — ₱4,000 is 400000 — because a floating-point peso
        loses a coin every few thousand additions and nobody notices until the books disagree.
      </p>
    </>
  );
}
