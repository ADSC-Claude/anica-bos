'use client';

import { TIER_LABELS } from '@/lib/tiers';

import { useState, useTransition } from 'react';
import type { Tier } from '@prisma/client';
import { upgradeAction } from '@/app/account/actions';

export function UpgradeButton({ invitationId, tier }: { invitationId: string; tier: Tier }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  return (
    <div className="mt-4">
      <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => start(async () => { const r = await upgradeAction(invitationId, tier); if (r && !r.ok) setError(r.error); })}>
        {pending ? 'Preparing…' : `Upgrade to ${TIER_LABELS[tier]}`}
      </button>
      {error && <p className="hint text-[color:var(--bad)]">{error}</p>}
    </div>
  );
}
