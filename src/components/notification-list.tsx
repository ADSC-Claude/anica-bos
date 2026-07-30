import Link from 'next/link';
import type { Notification } from '@prisma/client';
import { formatManila } from '@/lib/datetime';
import { markNotificationRead } from '@/app/portal/actions';

const KIND_ICON: Record<string, string> = {
  PENDING_BOOKING: '📅',
  DEPOSIT_TO_VERIFY: '💳',
  LOW_STOCK: '📦',
  PETTY_CASH_REQUEST: '💵',
  EXPENSE_APPROVAL: '🧾',
  EXPIRING_MEMBERSHIP: '⏰',
  CLIENT_FOLLOW_UP: '💬',
  OVERDUE_CORPORATE: '🏢',
  ANNOUNCEMENT: '📢',
  PERMIT_EXPIRY: '📋',
  DISCOUNT_APPROVAL: '🔑',
  PURCHASE_ORDER: '🛒',
  DIRECT_MESSAGE: '✉️',
};

export function NotificationList({
  notifications,
  compact = false,
}: {
  notifications: Notification[];
  compact?: boolean;
}) {
  if (!notifications.length) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="text-sm font-medium text-moss-700">You&apos;re all caught up</p>
        <p className="muted mt-1">Nothing needs your attention right now.</p>
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-sand-100">
      {notifications.map((n) => (
        <li key={n.id} className={n.readAt ? 'opacity-70' : ''}>
          <div className="flex items-start gap-3 px-4 py-3">
            <span aria-hidden className="text-lg leading-none">
              {KIND_ICON[n.kind] ?? '•'}
            </span>
            <div className="min-w-0 flex-1">
              {/* Clicking goes straight to the record that needs action. */}
              <Link href={n.link || '/portal'} className="block">
                <p className="text-sm font-medium text-moss-800">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-moss-500">{n.body}</p>}
                <p className="mt-1 text-[11px] text-moss-400">
                  {formatManila(n.createdAt, { time: true })}
                </p>
              </Link>
            </div>
            {!n.readAt && !compact && (
              <form
                action={async () => {
                  'use server';
                  await markNotificationRead(n.id);
                }}
              >
                <button className="btn-ghost btn-sm" type="submit">
                  Mark read
                </button>
              </form>
            )}
            {!n.readAt && compact && (
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-clay-500" aria-label="unread" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
