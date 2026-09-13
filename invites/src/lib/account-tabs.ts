import type { Tier } from '@prisma/client';
import { hasFeature, entitled, featureOffered } from './tiers';

/**
 * The strip of tabs across every page about one invitation.
 *
 * One tab per tool, in the order a customer meets them: fill it in, share
 * it, then the tools that run once guests have the link. A tool the package
 * does not include stays in the strip with an Upgrade pill, exactly as the
 * old Manage list kept it: a customer who cannot see that a seating plan
 * exists cannot want one. The list is a pure function so the strip and the
 * tests read the same one.
 */
export type TabKey = 'invitation' | 'share' | 'guests' | 'rsvps' | 'checkin' | 'messages' | 'guestbook' | 'photos' | 'saveTheDate' | 'pair' | 'settings' | 'guide';

export type Tab = {
  key: TabKey;
  label: string;
  href: string;
  /** Present but not bought: the tab opens the upgrade page. */
  locked?: boolean;
};

export type TabsInput = {
  id: string;
  tier: Tier;
  addOns: string[];
  /** This card is a Save the Date, announcing the invitation `pairId` names. */
  saveTheDate: boolean;
  /** The other half of the pair: the invitation this announces, or this invitation's Save the Date. */
  pairId?: string | null;
};

export function tabsFor(inv: TabsInput): Tab[] {
  const base = `/account/invitations/${inv.id}`;
  const at = (path: string) => `${base}${path}`;
  const upgrade = at('/upgrade');
  const lock = (has: boolean) => (has ? {} : { locked: true as const });

  /*
   * A Save the Date collects nothing — no RSVP, no guestbook, no photographs;
   * those belong to the invitation it announces — so its strip is the card,
   * its link, and the way across.
   */
  if (inv.saveTheDate) {
    return [
      { key: 'invitation', label: 'Save the Date', href: base },
      { key: 'share', label: 'Share', href: at('/share') },
      ...(inv.pairId ? [{ key: 'pair' as const, label: 'The invitation', href: `/account/invitations/${inv.pairId}` }] : []),
      { key: 'settings', label: 'Link & design', href: at('/settings') },
      { key: 'guide', label: 'Guide', href: at('/guide') },
    ];
  }

  const tabs: (Tab | null)[] = [
    { key: 'invitation', label: 'Invitation', href: base },
    { key: 'share', label: 'Share', href: at('/share') },
    featureOffered('guests.manager') ? { key: 'guests', label: 'Guest list', href: entitled(inv, 'guests.manager') ? at('/guests') : upgrade, ...lock(entitled(inv, 'guests.manager')) } : null,
    { key: 'rsvps', label: 'RSVP responses', href: at('/rsvps') },
    featureOffered('checkin') ? { key: 'checkin', label: 'Check-in', href: entitled(inv, 'checkin') ? at('/checkin') : upgrade, ...lock(entitled(inv, 'checkin')) } : null,
    // Open to every package: the words are the couple's whatever they bought.
    { key: 'messages', label: 'Messages', href: at('/messages') },
    { key: 'guestbook', label: 'Guestbook', href: hasFeature(inv.tier, 'guestbook') ? at('/guestbook') : upgrade, ...lock(hasFeature(inv.tier, 'guestbook')) },
    { key: 'photos', label: 'Guest photos', href: entitled(inv, 'photoSharing') ? at('/photos') : upgrade, ...lock(entitled(inv, 'photoSharing')) },
    inv.pairId ? { key: 'saveTheDate', label: 'Save the Date', href: `/account/invitations/${inv.pairId}` } : null,
    { key: 'settings', label: 'Link & design', href: at('/settings') },
    { key: 'guide', label: 'Guide', href: at('/guide') },
  ];
  return tabs.filter((t): t is Tab => t !== null);
}

/**
 * Which tab a path is on. The Invitation tab is the base path itself (and
 * the old /builder address, which still redirects there); every other tab
 * is its own path under it, so the longest prefix wins.
 */
export function currentTab(tabs: Tab[], pathname: string, base: string): TabKey | null {
  const clean = pathname.replace(/\/+$/, '');
  if (clean === base || clean === `${base}/builder`) return tabs.find((t) => t.key === 'invitation')?.key ?? null;
  const own = tabs.filter((t) => t.href.startsWith(`${base}/`) && !t.locked).sort((a, b) => b.href.length - a.href.length);
  return own.find((t) => clean === t.href || clean.startsWith(`${t.href}/`))?.key ?? null;
}
