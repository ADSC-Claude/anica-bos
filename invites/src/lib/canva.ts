import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './db';
import { seal, unseal } from './secrets';
import { HttpError } from './errors';
import { absoluteUrl } from './app-url';

/**
 * The studio's own Canva account.
 *
 * What this is for: the designs are drawn in Canva, and until now the only
 * way into the studio was a file — export the page, drop it on the importer.
 * That works (see src/lib/pdf-import.ts, which reads frames and words off a
 * PDF) and it is a step nobody should have to repeat for every revision. This
 * connects the account so a design can be picked from a list instead.
 *
 * What it is deliberately NOT for: generating a customer's invitation.
 * Canva's Autofill would hand back a finished, flat design — and this system
 * draws invitations itself, live text over the artwork, which is what lets a
 * countdown tick, an RSVP take a reply, a long name reflow and a page be read
 * in Tagalog. Autofill also requires a Canva Enterprise plan, which this
 * account (Teams) does not have. So: Canva supplies artwork, this system
 * supplies the invitation. The line is on purpose.
 *
 * One account, ours. Customers never connect theirs and are never asked to.
 *
 * Nothing here works until CANVA_CLIENT_ID and CANVA_CLIENT_SECRET are set.
 * Every entry point checks `configured()` first and says so plainly, because
 * a missing environment variable reading as "Canva is down" wastes an hour.
 */

const AUTHORIZE = 'https://www.canva.com/api/oauth/authorize';
const API = 'https://api.canva.com/rest/v1';

/**
 * What we ask Canva for, and nothing else.
 *
 * Reading design metadata is the list; reading design content is what an
 * export needs. Brand templates are readable on Teams and above, which is
 * this account. No write scope is requested: this integration never creates,
 * edits or deletes anything in the Canva account, and a token that cannot
 * write is a token that cannot ruin a master design by accident.
 */
export const SCOPES = ['design:meta:read', 'design:content:read', 'brandtemplate:meta:read'] as const;

export function configured(): boolean {
  return Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);
}

function credentials() {
  const id = process.env.CANVA_CLIENT_ID;
  const secret = process.env.CANVA_CLIENT_SECRET;
  if (!id || !secret) {
    throw new HttpError(503, 'Canva is not set up yet: CANVA_CLIENT_ID and CANVA_CLIENT_SECRET are not set.');
  }
  return { id, secret };
}

/**
 * Where Canva sends the browser back. Must match the Developer Portal exactly.
 *
 * Built from the app's own base URL rather than a second copy of that logic,
 * so a deployment that has VERCEL_PROJECT_PRODUCTION_URL but no explicit
 * NEXT_PUBLIC_APP_URL still produces the right host — the same reasoning that
 * keeps a forgotten variable out of a QR code printed on a hundred cards.
 */
export function redirectUri(): string {
  return absoluteUrl('/api/admin/canva/callback');
}

// ---------------------------------------------------------------------------
// The handshake
// ---------------------------------------------------------------------------

/**
 * PKCE, which Canva requires.
 *
 * The verifier is a secret this server keeps for the length of one handshake;
 * the challenge is its hash, and only the challenge travels to Canva in the
 * URL the browser follows. So an authorization code intercepted on the way
 * back is worth nothing without the verifier, which never left.
 */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(state: string, challenge: string): string {
  const { id } = credentials();
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTHORIZE}?${q}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

async function token(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = credentials();
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Canva takes the client credentials as HTTP Basic on the token call.
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    // Canva's own words where there are any: "invalid_grant" means the
    // refresh token is spent or revoked, which is a reconnect, not an outage.
    throw new HttpError(502, `Canva refused the token request: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  return token({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  });
}

// ---------------------------------------------------------------------------
// The stored connection
// ---------------------------------------------------------------------------

/** Writes the tokens away sealed, replacing whatever was there. */
export async function storeConnection(t: TokenResponse, accountName = ''): Promise<void> {
  const row = {
    accessToken: seal(t.access_token),
    refreshToken: seal(t.refresh_token),
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scopes: t.scope ?? SCOPES.join(' '),
    accountName,
  };
  const existing = await prisma.canvaConnection.findFirst({ select: { id: true } });
  if (existing) await prisma.canvaConnection.update({ where: { id: existing.id }, data: row });
  else await prisma.canvaConnection.create({ data: row });
}

export async function disconnect(): Promise<void> {
  await prisma.canvaConnection.deleteMany({});
}

/** What the admin page shows. Never includes a token. */
export async function connectionStatus() {
  const row = await prisma.canvaConnection.findFirst();
  if (!row) return { connected: false as const, configured: configured() };
  return {
    connected: true as const,
    configured: configured(),
    accountName: row.accountName,
    scopes: row.scopes.split(' ').filter(Boolean),
    expiresAt: row.expiresAt,
    lastSyncAt: row.lastSyncAt,
    connectedAt: row.connectedAt,
  };
}

/**
 * A usable access token, refreshed if it is close to expiring.
 *
 * A minute of headroom, because a token that expires between this check and
 * the call it is for fails as a 401 that reads like a revoked connection.
 * A refresh that fails is reported as a reconnect rather than retried: the
 * usual cause is a revoked or rotated refresh token, and retrying that only
 * turns one clear error into three slow ones.
 */
async function accessToken(): Promise<string> {
  const row = await prisma.canvaConnection.findFirst();
  if (!row) throw new HttpError(409, 'Canva is not connected yet.');

  if (row.expiresAt.getTime() > Date.now() + 60_000) {
    try {
      return unseal(row.accessToken);
    } catch {
      // Sealed under a different SESSION_SECRET, or edited. Refreshing will
      // fail the same way, so say the true thing now.
      throw new HttpError(409, 'The stored Canva tokens cannot be read. Reconnect Canva.');
    }
  }

  let refresh: string;
  try {
    refresh = unseal(row.refreshToken);
  } catch {
    throw new HttpError(409, 'The stored Canva tokens cannot be read. Reconnect Canva.');
  }
  const fresh = await token({ grant_type: 'refresh_token', refresh_token: refresh });
  await storeConnection(fresh, row.accountName);
  return fresh.access_token;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` },
  });
  if (res.status === 401) throw new HttpError(409, 'Canva rejected the connection. Reconnect Canva.');
  if (!res.ok) throw new HttpError(502, `Canva returned ${res.status} for ${path}.`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Reading the account
// ---------------------------------------------------------------------------

export type CanvaDesign = {
  id: string;
  title: string;
  /** Canva's own editor link, for "Open in Canva". */
  url?: string;
  thumbnailUrl?: string;
  updatedAt?: number;
};

type DesignRow = {
  id: string;
  title?: string;
  urls?: { edit_url?: string; view_url?: string };
  thumbnail?: { url?: string };
  updated_at?: number;
};

/**
 * The account's designs, newest first, optionally narrowed by a search term.
 *
 * Canva pages this with a continuation token rather than a page number, so
 * the caller passes back what it was given. One page is what the picker
 * shows; nobody scrolls a hundred designs looking for a wedding.
 */
export async function listDesigns(search?: string, continuation?: string): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
  const q = new URLSearchParams();
  if (search) q.set('query', search);
  if (continuation) q.set('continuation', continuation);
  const body = await call<{ items?: DesignRow[]; continuation?: string }>(`/designs${q.toString() ? `?${q}` : ''}`);
  await prisma.canvaConnection.updateMany({ data: { lastSyncAt: new Date() } });
  return {
    designs: (body.items ?? []).map(asDesign),
    continuation: body.continuation,
  };
}

export async function getDesign(id: string): Promise<CanvaDesign> {
  const body = await call<{ design: DesignRow }>(`/designs/${encodeURIComponent(id)}`);
  return asDesign(body.design);
}

function asDesign(row: DesignRow): CanvaDesign {
  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled',
    url: row.urls?.edit_url ?? row.urls?.view_url,
    thumbnailUrl: row.thumbnail?.url,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// What a design family points at
// ---------------------------------------------------------------------------

/**
 * The parts of one design family, each drawn from its own Canva design.
 *
 * A family is the main invitation plus the pieces that go with it. They are
 * separate Canva designs because they are separate artwork — a save the date
 * is not a cropped invitation — and separate ids because a share URL can be
 * re-pointed or revoked while an id is the design itself.
 *
 * Which parts a customer actually gets is decided here, by their package and
 * their add-ons, and never by Canva. Canva has no idea what Signature or
 * Luxury are and must not be taught: the plan is a row in our database, and
 * the same main invitation serves every plan that includes one.
 */
export type CanvaSlot = 'main' | 'saveTheDate' | 'demo';
export const CANVA_SLOTS: readonly CanvaSlot[] = ['main', 'saveTheDate', 'demo'];

export const CANVA_SLOT_LABELS: Record<CanvaSlot, string> = {
  main: 'Main invitation',
  saveTheDate: 'Save the Date',
  demo: 'Demo',
};

export type CanvaSources = Partial<Record<CanvaSlot, string>>;

/** Reads the Template.canva column, ignoring anything that is not a known slot. */
export function canvaSources(raw: unknown): CanvaSources {
  if (!raw || typeof raw !== 'object') return {};
  const from = raw as Record<string, unknown>;
  const out: CanvaSources = {};
  for (const slot of CANVA_SLOTS) {
    const id = from[slot];
    if (typeof id === 'string' && id.trim()) out[slot] = id.trim();
  }
  return out;
}

/** Sets or clears one slot, returning the whole column to store. */
export function withCanvaSource(raw: unknown, slot: CanvaSlot, id: string | null): CanvaSources {
  const next = canvaSources(raw);
  if (id && id.trim()) next[slot] = id.trim();
  else delete next[slot];
  return next;
}
