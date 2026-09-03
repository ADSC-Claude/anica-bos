import { requireStaffSession } from '@/lib/guard';
import { PageHeader } from '@/components/ui';
import { StaffPasswordForm } from './form';

export default async function StaffChangePassword() {
  const user = await requireStaffSession();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change your password" subtitle={user.mustChangePassword ? 'Your account was set up with a temporary password. Choose your own to continue.' : undefined} />
      <div className="card p-5"><StaffPasswordForm /></div>
    </div>
  );
}
