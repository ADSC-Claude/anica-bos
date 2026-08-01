import { requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { PageHeader, StatusBadge, Alert } from '@/components/ui';
import { SettingsNav } from '@/components/settings-nav';
import { IntakeFieldForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client intake form' };

export default async function IntakeSettingsPage() {
  const user = await requirePage('settings.edit');
  const fields = await prisma.clientFieldDefinition.findMany({
    include: { _count: { select: { values: true } } },
    orderBy: [{ section: 'asc' }, { sortRank: 'asc' }],
  });

  return (
    <div>
      <PageHeader
        title="Client intake form"
        subtitle="The questions asked on the public booking form and on the CRM intake screen."
      />
      <SettingsNav role={user.role} current="/portal/settings/intake" />

      <div className="mb-4 max-w-3xl">
        <Alert tone="info">
          Add, edit, reorder or retire questions here and <strong>both</strong> the online booking
          form and the CRM intake screen update together. Existing client answers are always
          preserved — retiring a question hides it without losing history. Health answers are
          visible only to signed-in staff and are excluded from every export except the
          Owner&apos;s full backup.
        </Alert>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Question</th>
                <th>Section</th>
                <th>Type</th>
                <th>On booking form</th>
                <th>Alerts on</th>
                <th className="text-right">Answers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id} className={f.retired ? 'opacity-50' : ''}>
                  <td className="font-medium text-cocoa-800">{f.label}</td>
                  <td className="text-xs capitalize">{f.section.toLowerCase()}</td>
                  <td className="text-xs">{f.type.toLowerCase()}</td>
                  <td className="text-xs">{f.showOnline ? 'yes' : 'no'}</td>
                  <td className="text-xs text-clay-500">{f.alertValues.join(', ') || '—'}</td>
                  <td className="num text-right">{f._count.values}</td>
                  <td>
                    <StatusBadge status={f.retired ? 'CANCELLED' : 'ACTIVE'} label={f.retired ? 'retired' : 'active'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <IntakeFieldForm
          fields={fields.map((f) => ({
            id: f.id, label: f.label, section: f.section, type: f.type,
            options: f.options.join(', '), helpText: f.helpText, required: f.required,
            showOnline: f.showOnline, alertValues: f.alertValues.join(', '),
            dependsOnKey: f.dependsOnKey ?? '', isNoneOption: f.isNoneOption,
            sortRank: f.sortRank, retired: f.retired,
          }))}
        />
      </div>
    </div>
  );
}
