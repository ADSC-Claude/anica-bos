import type { Tier } from '@prisma/client';
import { TIER_LABELS } from './tiers';

/**
 * The welcome: what a customer meets the first time they open their
 * invitation after paying. The confirm page sends them straight here rather
 * than showing a receipt and a button, so the welcome carries the receipt —
 * the order, the payment confirmed — and then lays out the plan: the
 * Get-started list under it, and an offer to be shown around.
 *
 * Pure, so the tab, the confirm page and the tests agree on when it is due
 * and what it says.
 */
export type Welcome = {
  /** The customer's first name, as they gave it. */
  name: string;
  /** The package's label — Signature, Luxury. */
  packageName: string;
  /** The order's reference, or nothing where staff made the invitation and no order was paid. */
  reference: string;
  /** Our team types the details in, so the other ways of handing them over are on offer too. */
  dfy: boolean;
};

/**
 * Due on this open: the owner's own invitation, still a draft, never
 * answered. Staff looking in are not welcomed, and neither is a customer
 * whose page is already live — the welcome is for someone about to start.
 */
export function welcomeDue(inv: { userId: string; status: string; welcomedAt: Date | null }, user: { id: string; role: string }): boolean {
  return user.role === 'CUSTOMER' && inv.userId === user.id && inv.status === 'DRAFT' && inv.welcomedAt === null;
}

/** "Maria Clara Santos" is greeted as Maria; a blank name as nobody in particular. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export function welcomeFor(user: { name: string }, inv: { tier: Tier; order: { reference: string; serviceMode: string } | null }): Welcome {
  return {
    name: firstName(user.name),
    packageName: TIER_LABELS[inv.tier],
    reference: inv.order?.reference ?? '',
    dfy: Boolean(inv.order && inv.order.serviceMode !== 'DIY'),
  };
}

/** The three lines over the Get-started list. */
export function welcomeLines(w: Welcome): { eyebrow: string; title: string; body: string } {
  const who = w.name ? `, ${w.name}` : '';
  const plan = w.dfy
    ? 'Here is the plan. Fill in the parts below — each one shows on your page as you type — or send your details, photos or an Excel over Messenger or Viber and we will type them in for you. Everything saves as you go.'
    : 'Here is the plan. Work down the list and each line ticks itself as you fill in. Everything saves as you go, and your page shows beside the form — or under Preview on a phone — exactly as a guest will see it.';
  return w.reference
    ? { eyebrow: `Order ${w.reference} · payment confirmed`, title: `Salamat${who}! Your ${w.packageName} package is unlocked.`, body: plan }
    : { eyebrow: 'Your invitation', title: `Welcome${who}. Your ${w.packageName} invitation is ready to fill in.`, body: plan };
}
