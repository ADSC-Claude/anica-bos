import { requireCustomerPage } from '@/lib/guard';
import { PageHeader } from '@/components/ui';
import { ChangePasswordForm } from './form';

export default async function ChangePasswordPage() {
  await requireCustomerPage();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" />
      <div className="card p-5"><ChangePasswordForm /></div>
    </div>
  );
}
