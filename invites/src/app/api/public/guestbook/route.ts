import { handle, jsonBody } from '@/lib/guard';
import { requestMeta } from '@/lib/auth';
import { guestbookSchema, submitGuestbook } from '@/lib/rsvp';

export const POST = handle(async (req) => {
  const input = await jsonBody(req, guestbookSchema);
  const { ip } = await requestMeta();
  const result = await submitGuestbook(input, ip);
  return { ok: true, pending: result.pending };
});
