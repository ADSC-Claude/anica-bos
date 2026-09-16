-- What the couple settled on, for the replies nobody vetted.
--
-- A guest answering through their personal link is held to the seats the couple
-- set aside for them: submitRsvp refuses a bigger number outright. A guest
-- answering through the plain link is held to nothing — there is no guest row,
-- no allotment, and the seats dropdown goes to ten. That number went straight
-- onto the headcount sheet and the caterer's count with nobody agreeing to it.
--
-- Nullable, and null everywhere on purpose: it means the couple has not looked,
-- and seatsHeld() falls back to the guest's own number, which is what every
-- existing reply has always meant. Nothing already on a list changes.
ALTER TABLE "Rsvp" ADD COLUMN "seatsApproved" INTEGER;

-- The queue reads "accepted, not yet decided" for one invitation.
CREATE INDEX "Rsvp_invitationId_seatsApproved_idx" ON "Rsvp"("invitationId", "seatsApproved");
