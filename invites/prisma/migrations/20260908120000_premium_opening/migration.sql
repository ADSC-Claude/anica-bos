-- The premium opening video is an add-on with any package. Bought with the
-- order (or switched on by staff), it lets the invitation play the design's
-- clip; without it the guest gets the opening every package includes.
ALTER TABLE "Invitation" ADD COLUMN "premiumOpening" BOOLEAN NOT NULL DEFAULT false;
