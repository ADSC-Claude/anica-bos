-- Add-ons: an extra that runs on the end of the treatment before it.
--
-- A hot compress after a massage is not a second appointment. She does not get
-- up, the bed is not turned over, and the five-minute changeover between
-- ordinary treatments would be inventing floor time that nobody spends.
ALTER TABLE "Service" ADD COLUMN "isAddOn" BOOLEAN NOT NULL DEFAULT false;

-- The catalogue already files these under "Add-ons & Sauna", but the sauna is a
-- real move to a real room and is emphatically not one of these. Matching on
-- the name rather than the category is what keeps it out.
UPDATE "Service" SET "isAddOn" = true WHERE "name" ILIKE '%add-on%';
