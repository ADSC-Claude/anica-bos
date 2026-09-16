-- The cinematic opening: a short clip that plays on tap before the
-- invitation. Shared per design on Template; overridden per couple on
-- Invitation for a Done-For-You or Concierge order.
ALTER TABLE "Template" ADD COLUMN "openingVideoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Template" ADD COLUMN "openingPosterUrl" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Invitation" ADD COLUMN "openingVideoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Invitation" ADD COLUMN "openingPosterUrl" TEXT NOT NULL DEFAULT '';
