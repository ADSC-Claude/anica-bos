-- Which guest wrote a wish, when they came through their own personal link.
-- Nullable and unbackfilled: every wish written before this column existed was
-- left without that evidence and there is no honest way to invent it.
ALTER TABLE "GuestbookEntry" ADD COLUMN "guestId" TEXT;

CREATE INDEX "GuestbookEntry_guestId_createdAt_idx" ON "GuestbookEntry"("guestId", "createdAt");

-- SET NULL, not CASCADE: removing somebody from the guest list must not erase
-- the wish they left. It becomes a wish from an unknown hand, which is what a
-- wish from the public link already is.
ALTER TABLE "GuestbookEntry" ADD CONSTRAINT "GuestbookEntry_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
