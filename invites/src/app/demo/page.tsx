import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function Demo() {
  const s = await getSettings();
  redirect(`/i/${s['site.demoSlug']}`);
}
