import { requirePage, resolveBranchId } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { PageHeader, Tabs, Alert } from '@/components/ui';
import { MARKETING_TABS } from '../tabs';
import { CampaignHelper } from './helper';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campaigns' };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const user = await requirePage('marketing.view');
  const params = await searchParams;
  const branchId = await resolveBranchId(user, params.branchId);
  const settings = await getSettings(branchId);

  const recentEmails = await prisma.emailLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  return (
    <div>
      <PageHeader
        title="Campaign helper"
        subtitle="Pick a segment, then send an email, export the list, or copy a ready-made greeting."
      />
      <Tabs tabs={MARKETING_TABS} current="/portal/marketing/campaigns" />

      <div className="mb-4 space-y-3">
        <Alert tone="info">
          <strong>Birthday greetings are automatic.</strong> The daily job emails every client on
          their birthday using the editable template in Settings, and logs it on their record.
          {!settings['email.birthdayGreetingEnabled'] && ' They are currently switched off.'}
        </Alert>
        {!settings['sms.enabled'] && (
          <Alert tone="warn">
            No SMS gateway is configured, so texts are not sent automatically. The helper below
            generates a pre-filled greeting and recipient list you can paste into a phone or
            Messenger. Add a Semaphore API key in Settings to enable automatic SMS.
          </Alert>
        )}
      </div>

      <CampaignHelper branchId={branchId} />

      {recentEmails.length > 0 && (
        <div className="mt-6">
          <h2 className="section-title mb-3">Recent emails</h2>
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Template</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEmails.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-xs">
                      {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="text-xs">{e.to}</td>
                    <td className="text-xs">{e.subject}</td>
                    <td className="text-xs text-moss-400">{e.template}</td>
                    <td className="text-xs">
                      {e.status === 'logged' ? 'logged (no API key)' : e.status}
                      {e.error && <span className="block text-clay-500">{e.error.slice(0, 60)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
