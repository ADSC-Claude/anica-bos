import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';
import { appUrl } from '@/lib/app-url';

export async function POST() {
  await destroySession();
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
