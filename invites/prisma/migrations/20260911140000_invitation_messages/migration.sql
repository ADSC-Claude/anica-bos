-- The tone a couple picked for their guest messages, and any line they rewrote.
-- Only the differences from the stock library are stored, so an empty object is
-- the right default and means "send the library's words".
--
-- Named guestMessages rather than messages: Invitation.messages is already the
-- support thread with the owner.
ALTER TABLE "Invitation" ADD COLUMN "guestMessages" JSONB NOT NULL DEFAULT '{}';
