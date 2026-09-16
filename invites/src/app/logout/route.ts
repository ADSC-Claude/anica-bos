import { NextResponse } from 'next/server';
import { destroySession, getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { appUrl } from '@/lib/app-url';

export async function POST() {
  // Read the session before destroying it: afterwards there is nobody to name.
  const user = await getSession();
  if (user) {
    await audit(user, {
      module: 'auth',
      action: 'logout',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.email} signed out.`,
    });
  }
  await destroySession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
