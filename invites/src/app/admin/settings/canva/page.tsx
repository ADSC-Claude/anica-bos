import Link from 'next/link';
import { requireStaffPage } from '@/lib/guard';
import { can } from '@/lib/rbac';
import { PageHeader, Card, Stat } from '@/components/ui';
import { connectionStatus, redirectUri, SCOPES, CANVA_SLOT_LABELS } from '@/lib/canva';
import { disconnectCanvaAction } from '../../actions';

export const dynamic = 'force-dynamic';

const PROBLEMS: Record<string, string> = {
  'not-configured': 'Canva is not set up on this server yet. CANVA_CLIENT_ID and CANVA_CLIENT_SECRET have to be set first.',
  refused: 'Canva did not grant access. Nothing was connected.',
  expired: 'That took too long, or the page was opened twice. Press Connect Canva again.',
  state: 'That callback did not match the one this page started, so it was refused. Press Connect Canva again.',
  exchange: 'Canva would not complete the connection. Check that the redirect URL below matches the one in the Developer Portal exactly.',
};

/**
 * The studio's Canva account: connect it, see what it is connected as, drop it.
 *
 * What this connection is for is worth saying on the page itself, because the
 * obvious guess is wrong and expensive: it does NOT generate customers'
 * invitations. Those are drawn here, live, from what the customer typed —
 * which is why a countdown ticks and a long name reflows. Canva supplies the
 * artwork a design is built from, so a revision can be picked off the account
 * instead of exported to a file and dropped on the importer.
 */
export default async function CanvaSettingsPage({ searchParams }: { searchParams: Promise<{ problem?: string; connected?: string }> }) {
  const user = await requireStaffPage('templates.edit');
  const sp = await searchParams;
  const status = await connectionStatus();
  const mayEdit = can(user.role, 'templates.edit');

  return (
    <>
      <PageHeader
        title="Canva"
        subtitle="The studio's own Canva account, so a design can be picked off it instead of exported to a file."
        actions={<Link href="/admin/settings" className="btn btn-secondary btn-sm">Back to settings</Link>}
      />

      {sp.problem && (
        <div role="alert" className="mb-4 rounded-lg bg-[#fbe9e7] p-3 text-sm text-[#8f1d17]">
          {PROBLEMS[sp.problem] ?? 'That did not work. Press Connect Canva again.'}
        </div>
      )}
      {sp.connected && !sp.problem && (
        <div className="mb-4 rounded-lg bg-[#e8f5e9] p-3 text-sm text-[#1b5e20]">Canva is connected.</div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Status" value={status.connected ? 'Connected' : 'Not connected'} tone={status.connected ? undefined : 'warn'} />
        <Stat label="Set up on this server" value={status.configured ? 'Yes' : 'No'} tone={status.configured ? undefined : 'warn'} hint={status.configured ? undefined : 'the two keys are missing'} />
        <Stat label="Last sync" value={status.connected && status.lastSyncAt ? status.lastSyncAt.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
        <Stat label="Autofill" value="Not used" hint="by design — see below" />
      </div>

      <Card title="The connection" className="mb-4">
        {!status.configured ? (
          <>
            <p className="text-sm">
              Before this can be connected, the integration has to exist in Canva&rsquo;s Developer Portal, under the
              studio&rsquo;s own Canva login. Canva requires two-factor authentication on the account before it will let one
              be created.
            </p>
            <p className="mt-2 text-sm">Its redirect URL has to be exactly this:</p>
            <p className="mt-1 break-all rounded bg-[color:var(--color-sand-100)] p-2 font-mono text-xs">{redirectUri()}</p>
            <p className="mt-2 text-sm">
              The Client ID and Client Secret it gives back go in this server&rsquo;s environment as{' '}
              <code className="text-xs">CANVA_CLIENT_ID</code> and <code className="text-xs">CANVA_CLIENT_SECRET</code>.
              They never belong in the code.
            </p>
          </>
        ) : status.connected ? (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[color:var(--color-ink-500)]">Connected as</dt><dd>{status.accountName || 'the studio’s Canva account'}</dd></div>
              <div><dt className="text-xs text-[color:var(--color-ink-500)]">Connected on</dt><dd>{status.connectedAt.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[color:var(--color-ink-500)]">What it may do</dt>
                <dd>{status.scopes.length ? status.scopes.join(', ') : SCOPES.join(', ')}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[color:var(--color-ink-500)]">
              Reading only. This integration asks for no permission to create, change or delete anything in the Canva
              account, so it cannot alter a master design by accident.
            </p>
            {mayEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a href="/api/admin/canva/connect" className="btn btn-secondary btn-sm">Reconnect</a>
                <form action={disconnectCanvaAction}>
                  <button type="submit" className="btn btn-ghost btn-sm text-[color:var(--bad)]">Disconnect</button>
                </form>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">
              Pressing this opens Canva and asks the studio&rsquo;s account for permission. Nothing in Canva is changed by
              connecting, and nothing is shared with customers.
            </p>
            {mayEdit && <a href="/api/admin/canva/connect" className="btn btn-primary btn-sm mt-3">Connect Canva</a>}
          </>
        )}
      </Card>

      <Card title="What this connection is, and is not">
        <p className="text-sm">
          <strong>Is:</strong> a way to pick a design off the studio&rsquo;s Canva account instead of exporting it to a file
          and dropping it on the importer. Each design family can point at its own Canva design for{' '}
          {Object.values(CANVA_SLOT_LABELS).join(', ').toLowerCase()}.
        </p>
        <p className="mt-2 text-sm">
          <strong>Is not:</strong> the thing that makes a customer&rsquo;s invitation. Invitations are drawn here, live, from
          what the customer typed — which is what lets the countdown tick, the RSVP take a reply, a long name reflow
          and a page be read in Tagalog. Canva&rsquo;s Autofill would hand back a flat, finished picture instead, and
          everything above would have to be bolted around it. It also needs a Canva Enterprise plan, which this
          account does not have.
        </p>
        <p className="mt-2 text-sm">
          Which parts a customer gets — main invitation, Save the Date — is decided here by their package and their
          add-ons. Canva is never asked and never told.
        </p>
      </Card>
    </>
  );
}
