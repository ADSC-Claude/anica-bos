import { requireSessionPage } from '@/lib/guard';
import { ChangePasswordForm } from './form';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const user = await requireSessionPage();
  return (
    <div className="mx-auto max-w-md">
      <h1 className="section-title mb-1">Set a new password</h1>
      <p className="muted mb-5">
        {user.mustChangePassword
          ? 'This account still uses its default password. Choose a new one to continue.'
          : 'Choose a new password for your account.'}
      </p>
      <div className="card-pad">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
