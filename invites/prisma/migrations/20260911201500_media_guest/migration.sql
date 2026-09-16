-- Which guest sent a photo, when they came through their own personal link.
--
-- It is what lets a named invitee have their own upload allowance instead of
-- sharing the room's. A venue's wifi is a single public address for every phone
-- in the room, so counting uploads by address made the hourly limit the whole
-- reception's rather than one guest's — and the guest who happened to send the
-- one over the line was told they had sent too many.
ALTER TABLE "Media" ADD COLUMN "guestId" TEXT;

ALTER TABLE "Media"
  ADD CONSTRAINT "Media_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The three counts a new photo asks for, each in one index scan: this guest's
-- in the last hour, this address's on this invitation in the last hour, and the
-- album's in the last hour.
CREATE INDEX "Media_invitationId_kind_guestId_createdAt_idx"
  ON "Media" ("invitationId", "kind", "guestId", "createdAt");
CREATE INDEX "Media_invitationId_kind_ip_createdAt_idx"
  ON "Media" ("invitationId", "kind", "ip", "createdAt");
