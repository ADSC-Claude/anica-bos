-- Undo the flags set by the reverted add-on work.
--
-- Head, Hand, Back, Foot, Hot Stone, Ventosa and Shower really are the spa's
-- add-ons, and the rule is written down in docs/add-ons.md. But the work that
-- flagged them was built from a note the owner asked to be recorded, not from
-- a decision to build, so it goes back until they say otherwise. Those seven
-- return to taking the ordinary five-minute interval.
UPDATE "Service"
SET "isAddOn" = false
WHERE lower(btrim("name")) IN ('head', 'hand', 'back', 'foot', 'hot stone', 'ventosa', 'shower');

-- What the earlier, in-scope work established stands: a service the catalogue
-- itself calls an add-on keeps the flag, and nothing needing the sauna ever
-- has it — an add-on happens where the treatment before it happened, and the
-- sauna is a walk to another room.
UPDATE "Service" SET "isAddOn" = true
WHERE lower("name") LIKE '%add-on%' AND "requiredResourceType" IS DISTINCT FROM 'SAUNA';

UPDATE "Service" SET "isAddOn" = false WHERE "requiredResourceType" = 'SAUNA';

-- The category-wide flag is no longer read by anything. Cleared rather than
-- dropped: dropping a column while the previous deployment is still serving
-- requests is how a release takes the site down.
UPDATE "ServiceCategory" SET "isAddOns" = false;
