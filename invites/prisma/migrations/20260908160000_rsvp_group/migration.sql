-- Which set a guest belongs to — "Principal sponsors", "College friends",
-- "Office" — in their own words when they reply. The couple writes the list of
-- groups on the RSVP section; a blank list asks nothing and leaves this empty.
-- Until now the only grouping was Guest.groupName, which comes from the guest
-- list manager, and that is not sold yet — so nobody replying on the public
-- link could say where they belong.
ALTER TABLE "Rsvp" ADD COLUMN "groupName" TEXT NOT NULL DEFAULT '';
