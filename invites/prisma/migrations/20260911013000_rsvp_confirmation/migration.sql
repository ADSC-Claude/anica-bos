-- Which reply an e-mail confirms.
--
-- A blast leaves this null: it is sent to a guest, not about a reply. A
-- confirmation sets it, so the couple's RSVP list can say of each reply whether
-- the guest was written to, without guessing from the address.
ALTER TABLE "EmailMessage" ADD COLUMN "rsvpId" TEXT;

CREATE INDEX "EmailMessage_rsvpId_idx" ON "EmailMessage"("rsvpId");

-- A deleted reply leaves the record of what was sent, the same as a deleted
-- guest does: what went out went out.
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_rsvpId_fkey" FOREIGN KEY ("rsvpId") REFERENCES "Rsvp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
