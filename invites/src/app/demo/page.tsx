import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { invitationPath } from '@/lib/app-url';
import { requireStaffPage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** The full demo invitation is for staff: the public sees a design by its opening only. */
export default async function Demo() {
  await requireStaffPage();
  const s = await getSettings();
  redirect(invitationPath(s['site.demoSlug']));
}
