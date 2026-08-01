-- The spa's actual add-ons, named by the owner:
--
--   "single word like this: Head, Hand, Back, Foot, Hot Stone, Ventosa, Shower
--    this is the only thing that if add up into anything doesnt need interval."
--
-- Matched on the *whole* name, never as a substring. The catalogue also holds
-- "Foot Massage (30 min)", "Foot Spa (45 min)" and "Hot Stone Massage (90 min)"
-- — full treatments on their own chair or bed. A LIKE '%foot%' here would turn
-- a ninety-minute hot stone massage into something with no changeover that has
-- to share the previous guest's bed.
UPDATE "Service"
SET "isAddOn" = true
WHERE lower(btrim("name")) IN ('head', 'hand', 'back', 'foot', 'hot stone', 'ventosa', 'shower')
  AND "requiredResourceType" IS DISTINCT FROM 'SAUNA';

-- Sauna and ear candling share the shelf with those, and are not add-ons: a
-- guest books either on its own, and the sauna is a walk to another room that
-- is then held for her alone.
UPDATE "Service"
SET "isAddOn" = false
WHERE lower(btrim("name")) LIKE 'sauna%'
   OR lower(btrim("name")) LIKE 'ear candling%'
   OR "requiredResourceType" = 'SAUNA';

-- The previous migration derived this from the category, which cannot express
-- one shelf holding both kinds. Anything it flagged that is not on the list
-- above and is not filed as an add-on by name goes back to being a treatment,
-- so nothing is left silently running with no interval.
UPDATE "Service"
SET "isAddOn" = false
WHERE "isAddOn" = true
  AND lower(btrim("name")) NOT IN ('head', 'hand', 'back', 'foot', 'hot stone', 'ventosa', 'shower')
  AND lower("name") NOT LIKE '%add-on%';
