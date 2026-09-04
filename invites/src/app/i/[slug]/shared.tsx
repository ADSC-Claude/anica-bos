import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadPublic, recordView, contentOf, type PublicInvitation } from '@/lib/invitations';
import { guestByToken } from '@/lib/guests';
import { hasGuestAccess } from '@/lib/guest-access';
import { isStaff } from '@/lib/rbac';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/app-url';
import { str, eventInstant } from '@/lib/sections';
import { formatDate } from '@/lib/datetime';
import { Invitation, type GuestForPage } from '@/components/invite/renderer';

/**
 * Shared by /i/[slug], /i/[slug]/[token] and the print view: who may see
 * what. A published invitation is public (or unlisted, or behind a password).
 * A draft is visible only to its owner and to staff, as a preview.
 */
export async function resolveInvitation(slug: string, token?: string) {
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation) notFound();

  const session = await getSession();
  const owner = session?.id === invitation.userId;
  const staff = session ? isStaff(session.role) : false;
  const previewer = owner || staff;

  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live && !previewer) notFound();

  const guest = token ? await guestByToken(token) : null;
  if (token && (!guest || guest.invitationId !== invitation.id)) notFound();

  const locked = !previewer && !(await hasGuestAccess(invitation));

  return { invitation, guest: guest as GuestForPage | null, preview: !live, previewer, locked };
}

export async function invitationMetadata(slug: string): Promise<Metadata> {
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation) return { title: 'Invitation' };
  const content = contentOf(invitation.content);
  const venue = str(content.ceremony, 'venue') || str(content.reception, 'venue');
  const when = eventInstant(content);
  const description = [when ? formatDate(when, 'weekday') : '', venue].filter(Boolean).join(' · ') || 'You are invited.';
  const image = invitation.ogImageUrl ? absoluteUrl(invitation.ogImageUrl.startsWith('/') ? invitation.ogImageUrl : `/${invitation.ogImageUrl}`.replace('//', '/')) : undefined;
  const absImage = invitation.ogImageUrl?.startsWith('http') ? invitation.ogImageUrl : image;
  const indexable = invitation.status === 'PUBLISHED' && invitation.privacy === 'PUBLIC';
  return {
    title: { absolute: invitation.title },
    description,
    openGraph: {
      title: invitation.title,
      description,
      type: 'website',
      url: absoluteUrl(`/i/${slug}`),
      images: absImage ? [{ url: absImage, width: 1200, height: 1500, alt: invitation.title }] : [{ url: absoluteUrl(`/i/${slug}/card`), width: 1080, height: 1350, alt: invitation.title }],
    },
    twitter: { card: 'summary_large_image', title: invitation.title, description },
    robots: indexable ? { index: true, follow: false } : { index: false, follow: false },
  };
}

export function PasswordGate({ slug, token, error }: { slug: string; token?: string; error?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-16 text-center">
      <p className="eyebrow mb-3">Private invitation</p>
      <h1 className="display text-2xl">Enter the password to open this invitation</h1>
      <form method="POST" action={`/i/${slug}/unlock`} className="mt-6 space-y-3">
        {token && <input type="hidden" name="token" value={token} />}
        <input name="password" type="password" required autoFocus className="field text-center" placeholder="Password" />
        {error && <p role="alert" className="text-sm text-[color:var(--bad)]">That password is not right.</p>}
        <button type="submit" className="btn btn-primary w-full">Open</button>
      </form>
      <p className="mt-6 text-xs text-[color:var(--color-ink-500)]">The hosts shared the password with the invitation. Ask them if you do not have it.</p>
    </main>
  );
}

export function ExpiredNotice({ invitation }: { invitation: PublicInvitation }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16 text-center">
      <p className="eyebrow mb-3">This invitation has closed</p>
      <h1 className="display text-2xl">{invitation.title}</h1>
      <p className="mt-4 text-sm text-[color:var(--color-ink-700)]">The celebration has passed and the link is no longer active. Thank you for being part of it.</p>
    </main>
  );
}

export async function InvitationPage({ slug, token, print = false, wrongPassword = false }: { slug: string; token?: string; print?: boolean; wrongPassword?: boolean }) {
  const { invitation, guest, previewer, locked } = await resolveInvitation(slug, token);
  if (locked) return <PasswordGate slug={slug} token={token} error={wrongPassword} />;
  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live && !previewer) notFound();
  if (invitation.expired && !previewer) return <ExpiredNotice invitation={invitation} />;
  if (live && !previewer && !print) await recordView(invitation.id);
  const s = await getSettings();
  return <Invitation invitation={invitation} guest={guest} preview={!live} print={print} businessName={s['business.name']} />;
}
