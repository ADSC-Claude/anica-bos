import { requireCustomerPage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { formatDateTime } from '@/lib/datetime';
import { PageHeader, ContactButtons } from '@/components/ui';
import { SupportForm } from './form';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const user = await requireCustomerPage();
  const [s, messages] = await Promise.all([getSettings(), prisma.supportMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, take: 200 })]);
  return (
    <>
      <PageHeader title="Help" subtitle="Messenger and Viber are fastest. Or leave a note here and we reply on your dashboard and by email." />
      <ContactButtons messenger={s['contact.messenger']} viber={s['contact.viber']} className="mb-6" />
      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className="card p-4">
          {messages.length === 0 ? <p className="text-sm text-[color:var(--color-ink-500)]">No messages yet.</p> : (
            <ul className="space-y-3">
              {messages.map((m) => (
                <li key={m.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${m.fromStaff ? 'bg-[color:var(--color-sand-100)]' : 'ml-auto bg-[#e3edf7]'}`}>
                  <p className="whitespace-pre-line">{m.body}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-ink-500)]">{m.fromStaff ? s['business.name'] : 'You'} · {formatDateTime(m.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <SupportForm />
        </div>
        <div className="card p-4 text-sm text-[color:var(--color-ink-700)]">
          <p className="font-semibold">Hours</p>
          <p>{s['contact.hoursNote']}</p>
          <p className="mt-3 font-semibold">Refunds</p>
          <p>{s['policy.refund']}</p>
        </div>
      </div>
    </>
  );
}
