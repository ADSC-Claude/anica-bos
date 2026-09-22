import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { handle, requireApi } from '@/lib/guard';
import { exchangeCode, storeConnection } from '@/lib/canva';
import { absoluteUrl } from '@/lib/app-url';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const back = (problem?: string) =>
  NextResponse.redirect(absoluteUrl(`/admin/settings/canva${problem ? `?problem=${problem}` : '?connected=1'}`), 303);

/** Constant-time compare, so a wrong state cannot be found a character at a time. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Where Canva sends the browser back, with an authorization code.
 *
 * Checked in this order, and all of it before the code is spent:
 *
 *  1. Staff, still. The redirect comes back into this app as a normal
 *     request, so it carries whatever session the browser has — which is not
 *     necessarily the one that started the handshake, and might be none.
 *  2. Canva said no, or errored. Nothing to exchange; say so and stop.
 *  3. The handshake cookie is there and its `state` matches. A callback
 *     nobody here started is the whole shape of the attack this prevents.
 *
 * The cookie is cleared on every path out, success or failure, so a verifier
 * is never left lying about for a second attempt.
 */
export const GET = handle(async (req) => {
  const user = await requireApi('templates.edit');
  const url = new URL(req.url);
  const store = await cookies();
  const raw = store.get('canva_handshake')?.value;
  const clear = () => store.delete({ name: 'canva_handshake', path: '/api/admin/canva' });

  if (url.searchParams.get('error')) {
    clear();
    return back('refused');
  }

  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code || !raw) {
    clear();
    return back('expired');
  }

  let handshake: { verifier?: string; state?: string };
  try {
    handshake = JSON.parse(raw) as typeof handshake;
  } catch {
    clear();
    return back('expired');
  }
  if (!handshake.verifier || !handshake.state || !same(handshake.state, state)) {
    clear();
    return back('state');
  }

  try {
    const tokens = await exchangeCode(code, handshake.verifier);
    await storeConnection(tokens);
    // Worth a line in the audit log: this is the moment the system gained
    // standing access to the account the whole catalogue is drawn in.
    await audit(user, {
      module: 'templates',
      action: 'canva.connected',
      entityType: 'CanvaConnection',
      summary: `Connected the studio's Canva account (${tokens.scope ?? 'default scopes'})`,
      sensitive: true,
    });
  } catch {
    clear();
    return back('exchange');
  }

  clear();
  return back();
});
