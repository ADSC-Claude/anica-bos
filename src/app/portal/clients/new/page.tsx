import { requirePage } from '@/lib/guard';
import { PageHeader } from '@/components/ui';
import { ClientForm } from '@/components/client-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New client' };

export default async function NewClientPage() {
  await requirePage('clients.edit');
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New client"
        subtitle="Only the name and mobile number are required — the rest can be completed on their next visit."
      />
      <ClientForm values={{ consentGiven: false, addressCity: 'Quezon City' }} />
    </div>
  );
}
