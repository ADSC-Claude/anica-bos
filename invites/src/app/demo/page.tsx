import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { invitationPath } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

export default async function Demo() {
  const s = await getSettings();
  redirect(invitationPath(s['site.demoSlug']));
}
