import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkGuestPassword } from '@/lib/invitations';
import { grantGuestAccess } from '@/lib/guest-access';
import { appUrl, invitationUrl } from '@/lib/app-url';

/** The password form posts here. Right: cookie + redirect. Wrong: redirect back with ?wrong=1. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  const token = String(form.get('token') ?? '');
  const back = invitationUrl(encodeURIComponent(slug), token ? encodeURIComponent(token) : undefined);

  const invitation = await prisma.invitation.findUnique({ where: { slug }, select: { id: true, passwordHash: true } });
  if (!invitation) return NextResponse.redirect(back, 303);

  if (await checkGuestPassword(invitation.id, password)) {
    await grantGuestAccess(invitation);
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.redirect(`${back}?wrong=1`, 303);
}
