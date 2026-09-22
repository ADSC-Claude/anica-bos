import { handle, jsonBody } from '@/lib/guard';
import { requestMeta } from '@/lib/auth';
import { HttpError } from '@/lib/errors';
import { guestbookSchema, submitGuestbook } from '@/lib/rsvp';
import { theBook } from '@/lib/invitations';

export const POST = handle(async (req) => {
  const input = await jsonBody(req, guestbookSchema);
  const { ip } = await requestMeta();
  const result = await submitGuestbook(input, ip);
  return { ok: true, pending: result.pending };
});

/**
 * The rest of the book, for a guest who tapped to read them.
 *
 * The wall shows three and says how many more there are; this answers the
 * "read them all" that line now offers. Everything that decides whether a
 * guest may read it lives in theBook() — published, switched on, approved
 * only, and the password if the invitation has one — and a no from any of
 * those comes back as the same 404 an unknown slug gets, because which of
 * them said no is not a stranger's business.
 */
export const GET = handle(async (req) => {
  const slug = new URL(req.url).searchParams.get('slug') ?? '';
  if (!slug) throw new HttpError(400, 'Which invitation?');
  const book = await theBook(slug);
  if (!book) throw new HttpError(404, 'There is no book here to read.');
  return { ok: true, wishes: book.wishes };
});
