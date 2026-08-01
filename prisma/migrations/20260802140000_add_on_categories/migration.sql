-- Add-on is a *category*, not a property somebody ticks on each service.
--
-- "Add on is a category, anything in it is if adding no interval." Filing a
-- new extra under the right heading is then the whole of the work, and no
-- treatment can quietly behave like an add-on because of a stray tick box.
ALTER TABLE "ServiceCategory" ADD COLUMN "isAddOns" BOOLEAN NOT NULL DEFAULT false;

-- Flag the add-ons heading — but never one that still holds the sauna.
--
-- The seeded catalogue files the sauna under "Add-ons & Sauna", and the sauna
-- is the opposite of an add-on: she gets up, walks to another room, and the
-- room is held for her alone. Flagging that category wholesale would give the
-- sauna no changeover and force it to share the previous treatment's bed,
-- which it cannot do. So a category containing anything that needs the sauna
-- is left alone and the owner can split it.
UPDATE "ServiceCategory" SET "isAddOns" = true
WHERE "name" ILIKE '%add-on%' OR "name" ILIKE '%add on%' OR "name" ILIKE '%addon%';

UPDATE "ServiceCategory" SET "isAddOns" = false
WHERE "id" IN (
  SELECT DISTINCT "categoryId" FROM "Service" WHERE "requiredResourceType" = 'SAUNA'
);

-- Bring every service into line with the shelf it sits on. A treatment needing
-- the sauna can never be an add-on: an add-on stays where the treatment before
-- it happened, and the sauna is somewhere else by definition.
UPDATE "Service" s
SET "isAddOn" = c."isAddOns"
FROM "ServiceCategory" c
WHERE s."categoryId" = c."id" AND s."requiredResourceType" IS DISTINCT FROM 'SAUNA';

UPDATE "Service" SET "isAddOn" = false WHERE "requiredResourceType" = 'SAUNA';
