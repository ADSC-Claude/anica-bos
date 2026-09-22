import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { handle, requireApi } from '@/lib/guard';
import { authorizeUrl, pkce, configured } from '@/lib/canva';
import { absoluteUrl } from '@/lib/app-url';

export const dynamic = 'force-dynamic';

/**
 * CONNECT CANVA. Sends the browser to Canva to ask the account's permission.
 *
 * Two things are minted here and neither travels where it could be read:
 *
 *  - the PKCE verifier, whose hash alone goes to Canva, so an authorization
 *    code intercepted on the way back cannot be spent by whoever caught it;
 *  - `state`, a random value compared on the way back, which is what stops
 *    somebody handing this admin a callback URL of their own making and
 *    quietly connecting *their* Canva account to this system.
 *
 * Both ride in one short-lived httpOnly cookie. Ten minutes is longer than
 * the handshake and shorter than a walk away from the desk.
 */
export const GET = handle(async () => {
  // Only staff who may edit designs; this connects the account every design
  // in the catalogue is drawn from.
  await requireApi('templates.edit');
  if (!configured()) {
    return NextResponse.redirect(absoluteUrl('/admin/settings/canva?problem=not-configured'), 303);
  }

  const { verifier, challenge } = pkce();
  const state = randomBytes(16).toString('base64url');

  const store = await cookies();
  store.set('canva_handshake', JSON.stringify({ verifier, state }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/admin/canva',
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(state, challenge), 303);
});
