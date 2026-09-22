import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadPublic, recordView, contentOf, resolveTheme, allWishes, type PublicInvitation } from '@/lib/invitations';
import { guestByToken } from '@/lib/guests';
import { hasGuestAccess } from '@/lib/guest-access';
import { isStaff } from '@/lib/rbac';
import { readDraftLink, keyOpens } from '@/lib/draft-link';
import { getSettings } from '@/lib/settings';
import { fontBook } from '@/lib/font-book';
import { absoluteUrl, invitationPath, invitationUrl } from '@/lib/app-url';
import { str, bool, eventInstant, anchorOf } from '@/lib/sections';
import { formatDate } from '@/lib/datetime';
import { cssVars } from '@/lib/theme';
import { t, type Lang } from '@/lib/copy';
import { Invitation, type GuestForPage } from '@/components/invite/renderer';
import { ScrollTo } from '@/components/invite/scroll-to';
import { documentOf, pageOfSection } from '@/lib/design';
import { sampleContent, isSample } from '@/lib/samples';

/**
 * Shared by /[slug], /[slug]/[token] and the print view: who may see
 * what. A published invitation is public (or unlisted, or behind a password).
 * A draft is visible only to its owner and to staff, as a preview.
 */
export async function resolveInvitation(slug: string, token?: string, key?: string) {
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation) notFound();

  const session = await getSession();
  const owner = session?.id === invitation.userId;
  const staff = session ? isStaff(session.role) : false;
  const previewer = owner || staff;

  /*
   * A Share-draft key. It says one thing — "you may see this design on its
   * own demo" — and it is checked against the design's current secret, so
   * Stop sharing ends every link at once. It is not a session and it is not
   * previewer standing: it opens the page and the draft design, and nothing
   * else. A password on the page still holds.
   */
  const keyed = key ? keyOpens(await readDraftLink(key), invitation.template, slug) : false;

  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live && !previewer && !keyed) notFound();

  const guest = token ? await guestByToken(token) : null;
  if (token && (!guest || guest.invitationId !== invitation.id)) notFound();

  const locked = !previewer && !(await hasGuestAccess(invitation));

  return { invitation, guest: guest as GuestForPage | null, preview: !live, previewer, keyed, locked };
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
      url: invitationUrl(slug),
      images: absImage ? [{ url: absImage, width: 1200, height: 1500, alt: invitation.title }] : [{ url: absoluteUrl(`${invitationPath(slug)}/card`), width: 1080, height: 1350, alt: invitation.title }],
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
      <form method="POST" action={`${invitationPath(slug)}/unlock`} className="mt-6 space-y-3">
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

/**
 * Every message, on a page of its own.
 *
 * "Can the messages they leave can have a button where they can read all the
 * messages like 'show all messages' in a separate tab not in the main page."
 *
 * The wall on the invitation holds three so the celebration keeps moving.
 * The rest were reachable only from the couple's Guestbook tab, which is not
 * a guest's to open — so most of why a guestbook is on a page at all, that
 * guests read what everybody wrote, did not work.
 *
 * A page rather than an expanding section, because that is what she asked
 * for and it is also the better answer: the invitation never grows to eighty
 * messages deep, the link can be sent on its own or opened in a new tab, and
 * a guest reading the book is not scrolling the celebration to do it.
 *
 * It resolves the invitation exactly as every other guest page does, so the
 * gates are the page's and not a second set to keep in step: a draft is its
 * owner's only, an expired link says so, a password shows the password form.
 * Only approved wishes are loaded, and a guestbook switched off has no page
 * at all — whatever is still stored behind it.
 *
 * Her palette and her fonts come from the same resolveTheme the invitation
 * uses, so the book is in the celebration's colours rather than the app's.
 */
export async function MessagesPage({ slug, token }: { slug: string; token?: string }) {
  const { invitation, previewer, keyed, locked } = await resolveInvitation(slug, token);
  if (locked) return <PasswordGate slug={slug} token={token} />;
  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live && !previewer && !keyed) notFound();
  if (invitation.expired && !previewer && !keyed) return <ExpiredNotice invitation={invitation} />;

  const content = contentOf(invitation.content);
  // No guestbook, no book. The page is not a way round the switch.
  if (!bool(content.guestbook, 'enabled')) notFound();

  const wishes = await allWishes(invitation.id);
  const lang: Lang = invitation.language === 'tl' ? 'tl' : 'en';
  const theme = resolveTheme(invitation.template, content, invitation.tier, await fontBook());
  const back = invitationPath(slug, token);

  return (
    <main className="inv-book" style={cssVars(theme.palette, theme.fonts) as CSSProperties} lang={lang}>
      <h1>{t(lang, 'guestbook.title')}</h1>
      <p className="inv-book-count">
        {wishes.length === 1 ? t(lang, 'guestbook.oneMessage') : t(lang, 'guestbook.someMessages', { n: wishes.length })}
      </p>

      {wishes.length > 0 ? (
        <ul className="inv-book-list">
          {wishes.map((w) => (
            <li key={w.id} className="inv-book-note">
              <p className="inv-book-words">{w.message}</p>
              <p className="inv-book-who">— {w.name}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inv-book-none">{t(lang, 'guestbook.first')}</p>
      )}

      <a className="inv-book-back" href={back}>← {t(lang, 'guestbook.backToInvitation')}</a>
    </main>
  );
}

/**
 * The peek: a design's demo from the opening to Our Story, for a visitor
 * choosing a design. Only the invitation a design names as its demo
 * (Template.demoSlug) opens this way, whatever its status — the design
 * declares it public — and it stops after Our Story with the way in.
 * No view is counted and no guest's link is involved.
 */
export async function PeekPage({ slug, embed = false }: { slug: string; embed?: boolean }) {
  const invitation = await loadPublic(slug, { preview: true });
  if (!invitation || invitation.template.demoSlug !== slug) notFound();
  const s = await getSettings();
  return <Invitation invitation={invitation} guest={null} peek embed={embed} sets={await fontBook()} businessName={s['business.name']} />;
}

/**
 * `bare` drops the opening, the music and the day-and-night toggle: the page
 * as a page, for staff working on it beside a form. Only a previewer (the
 * owner or staff) gets it; a guest's link always opens the way it was made.
 *
 * `draft` draws the design from what the studio has saved rather than from
 * what is published — the whole invitation, page after page, as the design
 * she is drawing would serve it. Like `bare` it is a previewer's view only,
 * so an unfinished design cannot be handed to anybody through a link.
 *
 * `only`, `sample` and `mode` are the studio's canvas: one page of the
 * draft on its own, as a guest would be served it — the words laid out for
 * real, at their real height — drawn against the demo, a customer, or a
 * made-up sample, by day or by night. Bare and previewer only, all three:
 * a guest's link is never one page of an invitation, and a sample is
 * nobody's words.
 */
export async function InvitationPage({ slug, token, print = false, wrongPassword = false, bare = false, draft = false, designKey, at, only, sample, mode, screen }: { slug: string; token?: string; print?: boolean; wrongPassword?: boolean; bare?: boolean; draft?: boolean; designKey?: string; at?: string; only?: string; sample?: string; mode?: string; screen?: string }) {
  const { invitation, guest, previewer, keyed, locked } = await resolveInvitation(slug, token, designKey);
  if (locked) return <PasswordGate slug={slug} token={token} error={wrongPassword} />;
  const live = invitation.status === 'PUBLISHED' && !invitation.expired;
  if (!live && !previewer && !keyed) notFound();
  if (invitation.expired && !previewer && !keyed) return <ExpiredNotice invitation={invitation} />;
  // somebody looking at an unfinished design is not a guest, and is not counted as one
  if (live && !previewer && !keyed && !print) await recordView(invitation.id);
  const s = await getSettings();
  const shown = draft && (previewer || keyed)
    ? { ...invitation, template: { ...invitation.template, design: invitation.template.designDraft } }
    : invitation;
  const studio = bare && (previewer || keyed);
  const content = contentOf(shown.content) as Record<string, unknown>;
  const made = studio && isSample(sample) && sample !== 'demo'
    ? sampleContent(sample, { doc: documentOf(shown.template), occasion: invitation.occasion, demo: content })
    : content;
  const themed = studio && mode === 'night' ? { ...made, theme: { ...((made.theme as Record<string, unknown> | undefined) ?? {}), mode: 'night' } } : made;
  const canvas = themed === content ? shown : { ...shown, content: themed as never };
  return (
    <>
      <Invitation invitation={canvas} guest={guest} preview={!live} print={print} bare={bare && previewer} only={studio ? only : undefined} screen={screenPx(screen)} sets={await fontBook()} businessName={s['business.name']} />
      {bare && previewer && at && <ScrollTo id={anchorOf(at)} page={pageOfSection(documentOf(shown.template), at)?.key} />}
    </>
  );
}

/** The studio's screen height, held to a plausible phone or laptop. */
export function screenPx(v: string | undefined): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= 400 && n <= 2000 ? Math.round(n) : undefined;
}
