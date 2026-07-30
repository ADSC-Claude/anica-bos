import { requirePage } from '@/lib/guard';
import { listNotifications } from '@/lib/notifications';
import { PageHeader } from '@/components/ui';
import { NotificationList } from '@/components/notification-list';
import { markAllNotificationsRead } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await requirePage();
  const notifications = await listNotifications(user, 100);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Everything waiting on you. Tap any item to open the record."
        actions={
          <form action={markAllNotificationsRead}>
            <button className="btn-secondary btn-sm" type="submit">
              Mark all read
            </button>
          </form>
        }
      />
      <NotificationList notifications={notifications} />
    </div>
  );
}
