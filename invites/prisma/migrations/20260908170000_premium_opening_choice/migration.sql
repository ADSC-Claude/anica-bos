-- Which of the design's premium openings an invitation plays. Blank is the
-- design's first, which is what every invitation played until now.
ALTER TABLE "Invitation" ADD COLUMN "premiumOpeningKey" TEXT NOT NULL DEFAULT '';
