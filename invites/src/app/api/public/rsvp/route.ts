import { handle, jsonBody } from '@/lib/guard';
import { requestMeta } from '@/lib/auth';
import { rsvpSchema, submitRsvp } from '@/lib/rsvp';

export const POST = handle(async (req) => {
  const input = await jsonBody(req, rsvpSchema);
  const { ip } = await requestMeta();
  const saved = await submitRsvp(input, ip);
  return { ok: true, id: saved.id, response: saved.response };
});
